import "server-only";
import { randomUUID } from "node:crypto";
import {
  collections,
  type IntegrationDoc,
  type IntegrationVarDoc,
  type VercelTarget,
} from "./db";
import { DecryptionError, decryptValue } from "./crypto";
import { recordAudit } from "./audit";
import {
  VercelError,
  createEnv,
  deleteEnv,
  findDeploymentSince,
  listEnv,
  triggerDeployHook,
  updateEnv,
  type VercelEnvVar,
} from "./vercel";

/**
 * Keel to Vercel environment variable synchronization.
 *
 * Keel is the source of truth for the variables it manages. Ownership is
 * explicit: Keel only ever updates or deletes variables recorded in
 * `integration_vars`, i.e. ones it created (or adopted under the "overwrite"
 * conflict policy). A same-named variable it does not own is a conflict and is
 * left untouched under the default "skip" policy.
 *
 * Reliability model (no job queue exists in this codebase):
 *  - A sync is a full reconcile of an environment, so it is idempotent and a
 *    missed or repeated trigger cannot leave things inconsistent.
 *  - Changes are debounced in process, then run under a database lease so two
 *    syncs for one integration never overlap. A change that arrives during a
 *    run sets `dirty` and the running sync loops once more.
 *  - A redeploy is only triggered after a fully successful sync with no
 *    conflicts or failures, once per run id.
 */

export type RunSummary = {
  status: "success" | "partial" | "failed" | "busy";
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  conflicts: string[];
  failed: string[];
  error?: string;
  deployment?: "triggered" | "skipped" | "none";
  deploymentReason?: string;
};

const LOCK_MS = 2 * 60 * 1000;
const DEBOUNCE_MS = () => Number(process.env.KEEL_SYNC_DEBOUNCE_MS ?? 3000);
const MAX_WAIT_MS = 15_000;
const MAX_ROUNDS = 3;

export async function tokenOf(integ: IntegrationDoc): Promise<string> {
  return decryptValue(integ.tokenEnc, integ._id);
}

async function hookOf(integ: IntegrationDoc): Promise<string | null> {
  return integ.hookEnc ? decryptValue(integ.hookEnc, `${integ._id}:hook`) : null;
}

async function acquire(id: string): Promise<boolean> {
  const { integrations } = await collections();
  const now = new Date();
  const got = await integrations.findOneAndUpdate(
    { _id: id, $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lt: now } }] },
    { $set: { lockUntil: new Date(now.getTime() + LOCK_MS) } },
  );
  return got !== null;
}

async function release(id: string) {
  const { integrations } = await collections();
  await integrations.updateOne({ _id: id }, { $unset: { lockUntil: "" } });
}

type Counts = Pick<RunSummary, "created" | "updated" | "deleted" | "unchanged" | "conflicts" | "failed">;
const emptyCounts = (): Counts => ({
  created: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  conflicts: [],
  failed: [],
});

/** Reconciles one Keel environment into its Vercel target. */
async function reconcileEnvironment(
  integ: IntegrationDoc,
  token: string,
  envSlug: string,
  target: VercelTarget,
  remote: VercelEnvVar[],
  counts: Counts,
) {
  const { environments, secrets, integrationVars } = await collections();
  const projectId = integ.vercelProjectId!;
  const environment = await environments.findOne({ projectId: integ.projectId, slug: envSlug });
  if (!environment) return;

  const docs = await secrets
    .find({ projectId: integ.projectId, environmentId: environment._id })
    .toArray();
  const byId = new Map(docs.map((s) => [s._id, s]));
  const rows = await integrationVars
    .find({ integrationId: integ._id, environmentSlug: envSlug })
    .toArray();
  const rowBySecret = new Map(rows.map((r) => [r.secretId, r]));

  const fail = (key: string) => counts.failed.push(key);
  const guard = async (key: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      // Credentials problems stop the whole run; anything else is per key.
      if (err instanceof VercelError && err.needsAttention) throw err;
      fail(key);
    }
  };

  // 1. Variables Keel owns whose secret no longer exists.
  for (const row of rows) {
    if (byId.has(row.secretId)) continue;
    await guard(row.key, async () => {
      await deleteEnv(token, projectId, integ.teamId, row.vercelEnvId);
      await integrationVars.deleteOne({ _id: row._id });
      counts.deleted++;
    });
  }

  // 2. Current secrets.
  for (const secret of docs) {
    await guard(secret.key, async () => {
      let value: string;
      try {
        value = decryptValue(secret.value, secret._id);
      } catch (err) {
        if (err instanceof DecryptionError) throw new Error("decrypt");
        throw err;
      }
      const version = secret.version ?? 1;
      let row: IntegrationVarDoc | undefined = rowBySecret.get(secret._id);

      // Renamed secret or remapped environment: retire the old variable.
      if (row && (row.key !== secret.key || row.target !== target)) {
        await deleteEnv(token, projectId, integ.teamId, row.vercelEnvId);
        await integrationVars.deleteOne({ _id: row._id });
        counts.deleted++;
        row = undefined;
      }

      if (row) {
        const stillThere = remote.some((v) => v.id === row!.vercelEnvId);
        if (stillThere) {
          if (row.syncedVersion === version) {
            counts.unchanged++;
            return;
          }
          await updateEnv(token, projectId, integ.teamId, row.vercelEnvId, value);
          await integrationVars.updateOne(
            { _id: row._id },
            { $set: { syncedVersion: version, syncedAt: new Date() } },
          );
          counts.updated++;
          return;
        }
        // Deleted on the Vercel side. Keel is the source of truth: recreate.
        await integrationVars.deleteOne({ _id: row._id });
        row = undefined;
      }

      // Not owned by Keel yet. Is there a same-named variable?
      const clash = remote.find(
        (v) => v.key === secret.key && v.target.includes(target) && !v.gitBranch,
      );
      let vercelEnvId: string;
      if (clash) {
        const exclusive = clash.target.length === 1;
        if (integ.conflictPolicy !== "overwrite" || !exclusive) {
          counts.conflicts.push(secret.key);
          return;
        }
        await updateEnv(token, projectId, integ.teamId, clash.id, value);
        vercelEnvId = clash.id;
        counts.updated++;
      } else {
        vercelEnvId = await createEnv(token, projectId, integ.teamId, {
          key: secret.key,
          value,
          target,
        });
        counts.created++;
      }

      await integrationVars.updateOne(
        { integrationId: integ._id, secretId: secret._id },
        {
          $set: {
            environmentSlug: envSlug,
            key: secret.key,
            target,
            vercelEnvId,
            syncedVersion: version,
            syncedAt: new Date(),
          },
          $setOnInsert: { _id: randomUUID() },
        },
        { upsert: true },
      );
    });
  }
}

/**
 * Runs a sync for an integration. Safe to call concurrently: only one run holds
 * the lease; others mark the integration dirty and return "busy".
 */
export async function performSync(
  integrationId: string,
  opts: {
    actorId: string;
    envs?: string[];
    /** Redeploy even if nothing changed (manual "Sync & Redeploy"). */
    forceRedeploy?: boolean;
    mode: "manual" | "auto";
  },
): Promise<RunSummary> {
  const { integrations, integrationVars } = await collections();

  if (!(await acquire(integrationId))) {
    await integrations.updateOne(
      { _id: integrationId },
      {
        $set: { dirty: true },
        ...(opts.envs ? { $addToSet: { pendingEnvs: { $each: opts.envs } } } : {}),
      },
    );
    return { status: "busy", ...emptyCounts() };
  }

  const runId = randomUUID();
  const total = emptyCounts();
  const touched = new Set<string>();
  let fatal: string | undefined;
  let needsAttention = false;

  try {
    let wanted = opts.envs;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const integ = await integrations.findOne({ _id: integrationId });
      if (!integ || !integ.vercelProjectId) {
        fatal = "The integration is not linked to a Vercel project.";
        break;
      }
      const pending = integ.pendingEnvs ?? [];
      await integrations.updateOne(
        { _id: integrationId },
        { $unset: { dirty: "" }, $set: { pendingEnvs: [] } },
      );

      const mapped = Object.keys(integ.mappings);
      const envs = (wanted ?? mapped).concat(pending).filter((e, i, a) => mapped.includes(e) && a.indexOf(e) === i);
      wanted = undefined;

      // Variables of environments no longer mapped are released, not deleted.
      await integrationVars.deleteMany({
        integrationId,
        environmentSlug: { $nin: mapped },
      });

      if (envs.length > 0) {
        const token = await tokenOf(integ);
        const remote = await listEnv(token, integ.vercelProjectId, integ.teamId);
        for (const env of envs) {
          touched.add(env);
          const c = emptyCounts();
          try {
            await reconcileEnvironment(integ, token, env, integ.mappings[env], remote, c);
          } finally {
            total.created += c.created;
            total.updated += c.updated;
            total.deleted += c.deleted;
            total.unchanged += c.unchanged;
            total.conflicts.push(...c.conflicts);
            total.failed.push(...c.failed);
          }
        }
      }

      const after = await integrations.findOne({ _id: integrationId }, { projection: { dirty: 1 } });
      if (!after?.dirty) break;
    }
  } catch (err) {
    if (err instanceof VercelError) {
      fatal = err.message;
      needsAttention = err.needsAttention;
    } else {
      fatal = "The sync failed unexpectedly.";
    }
  }

  const changes = total.created + total.updated + total.deleted;
  const clean = !fatal && total.failed.length === 0 && total.conflicts.length === 0;
  const status: RunSummary["status"] = fatal
    ? "failed"
    : clean
      ? "success"
      : "partial";

  const summary: RunSummary = { status, ...total, ...(fatal ? { error: fatal } : {}) };
  const now = new Date();

  const integ = await integrations.findOne({ _id: integrationId });
  const failedSecretNote =
    total.failed.length > 0 ? "Some variables could not be synced." : undefined;
  const conflictNote =
    total.conflicts.length > 0
      ? "Some variables already exist in Vercel and were left untouched."
      : undefined;

  await integrations.updateOne(
    { _id: integrationId },
    {
      $set: {
        lastSyncAt: now,
        lastSyncStatus: status,
        lastRun: {
          runId,
          at: now,
          created: total.created,
          updated: total.updated,
          deleted: total.deleted,
          unchanged: total.unchanged,
          conflicts: total.conflicts.slice(0, 50),
          failed: total.failed.slice(0, 50),
        },
        updatedAt: now,
        ...(needsAttention ? { status: "attention" as const } : {}),
        ...(fatal || failedSecretNote || conflictNote
          ? { lastError: fatal ?? failedSecretNote ?? conflictNote }
          : {}),
      },
      ...(!fatal && !failedSecretNote && !conflictNote ? { $unset: { lastError: "" } } : {}),
    },
  );

  await recordAudit({
    projectId: integ?.projectId ?? "",
    actorId: opts.actorId,
    action: "integration.synced",
    targetType: "integration",
    targetId: integrationId,
    metadata: {
      provider: "vercel",
      mode: opts.mode,
      status,
      environments: [...touched].join(","),
      created: total.created,
      updated: total.updated,
      deleted: total.deleted,
      unchanged: total.unchanged,
      conflicts: total.conflicts.length,
      failed: total.failed.length,
    },
  });

  // Redeploy only after a fully successful sync, once per run.
  const wantsDeploy = opts.forceRedeploy || (integ?.autoRedeploy && changes > 0);
  if (!wantsDeploy) {
    summary.deployment = "none";
  } else if (!clean) {
    summary.deployment = "skipped";
    summary.deploymentReason = "Not redeployed because the sync was not fully successful.";
  } else if (!integ?.hookEnc) {
    summary.deployment = "skipped";
    summary.deploymentReason = "No deploy hook is configured.";
  } else {
    // At most one deployment per run id.
    const claimed = await integrations.findOneAndUpdate(
      { _id: integrationId, lastDeployRunId: { $ne: runId } },
      { $set: { lastDeployRunId: runId } },
    );
    if (claimed) {
      try {
        const hook = (await hookOf(integ))!;
        const triggeredAt = new Date();
        const job = await triggerDeployHook(hook);
        await integrations.updateOne(
          { _id: integrationId },
          {
            $set: {
              lastDeployment: {
                runId,
                ...(job.jobId ? { jobId: job.jobId } : {}),
                state: job.state,
                triggeredAt,
              },
            },
          },
        );
        await recordAudit({
          projectId: integ.projectId,
          actorId: opts.actorId,
          action: "integration.deploy_triggered",
          targetType: "integration",
          targetId: integrationId,
          metadata: { provider: "vercel", mode: opts.mode, runId, jobId: job.jobId },
        });
        summary.deployment = "triggered";
      } catch (err) {
        summary.deployment = "skipped";
        summary.deploymentReason =
          err instanceof VercelError ? err.message : "The deployment could not be triggered.";
        await integrations.updateOne(
          { _id: integrationId },
          { $set: { lastError: summary.deploymentReason } },
        );
      }
    }
  }

  await release(integrationId);
  return summary;
}

/** Updates the stored deployment state from Vercel. Best effort. */
export async function refreshDeployment(integ: IntegrationDoc) {
  const d = integ.lastDeployment;
  if (!d || ["READY", "ERROR", "CANCELED"].includes(d.state) || !integ.vercelProjectId) return;
  try {
    const found = await findDeploymentSince(
      await tokenOf(integ),
      integ.vercelProjectId,
      integ.teamId,
      d.triggeredAt.getTime(),
    );
    if (!found) return;
    const { integrations } = await collections();
    await integrations.updateOne(
      { _id: integ._id },
      {
        $set: {
          "lastDeployment.deploymentId": found.deploymentId,
          "lastDeployment.state": found.state,
          ...(found.url ? { "lastDeployment.url": found.url } : {}),
        },
      },
    );
  } catch {
    /* status stays as it was */
  }
}

// ---- change notification and debounce ------------------------------------

const g = globalThis as unknown as {
  keelSyncTimers?: Map<string, { timer: ReturnType<typeof setTimeout>; first: number }>;
};

function schedule(integrationId: string, actorId: string) {
  const timers = (g.keelSyncTimers ??= new Map());
  const now = Date.now();
  const existing = timers.get(integrationId);
  const first = existing?.first ?? now;
  if (existing) clearTimeout(existing.timer);

  // Trailing debounce with a ceiling, so a steady stream still syncs.
  const delay = Math.max(0, Math.min(DEBOUNCE_MS(), first + MAX_WAIT_MS - now));
  const timer = setTimeout(() => {
    timers.delete(integrationId);
    performSync(integrationId, { actorId, mode: "auto" }).catch(() => {});
  }, delay);
  timer.unref?.();
  timers.set(integrationId, { timer, first });
}

/**
 * Called after any secret change. Never throws and never blocks the request:
 * if the integration is missing or the environment is not mapped it is a
 * no-op; otherwise the environment is queued for a debounced sync.
 */
export async function notifySecretsChanged(
  projectId: string,
  envSlug: string,
  actorId: string,
) {
  try {
    const { integrations } = await collections();
    const integ = await integrations.findOne({
      projectId,
      provider: "vercel",
      status: "active",
    });
    if (!integ || !integ.mappings[envSlug]) return;
    await integrations.updateOne(
      { _id: integ._id },
      { $addToSet: { pendingEnvs: envSlug }, $set: { pendingActorId: actorId } },
    );
    schedule(integ._id, actorId);
  } catch {
    /* a failed notification must never fail the secret change */
  }
}
