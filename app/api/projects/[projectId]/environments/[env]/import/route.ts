import { collections } from "@/lib/db";
import { DecryptionError, decryptValue } from "@/lib/crypto";
import {
  createSecretWithVersion,
  writeNewVersion,
} from "@/lib/secret-versions";
import { can } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { notifySecretsChanged } from "@/lib/vercel-sync";
import { rateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  authorizeEnvironment,
  handler,
  isDuplicateKeyError,
  json,
  parseSecretKey,
  parseSecretValue,
  readBody,
  requireAuth,
} from "@/lib/api";

type Ctx = { params: Promise<{ projectId: string; env: string }> };

const MAX_ENTRIES = 500;
const MAX_BODY_BYTES = 2_000_000;

type Status = "created" | "updated" | "unchanged" | "skipped" | "failed";
type Result = { key: string; status: Status; error?: string };

/**
 * Bulk import of already-parsed entries into one environment.
 *
 * Everything is validated before anything is written: a bad entry rejects the
 * whole request with no changes. Writing then goes through the same
 * create/update paths as single-secret requests, so encryption, version
 * history and audit events are identical. The response lists the outcome of
 * every entry, so a partial failure is explicit rather than silent.
 *
 * Entries are `{ key, value, overwrite }`. A key that already exists is only
 * changed when `overwrite` is true; otherwise it is skipped.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const { userId, via } = await requireAuth(); // browser sessions only
  rateLimit(`import:${userId}`, { limit: 10, windowMs: 60_000 });
  const { projectId, env } = await params;

  // Gate first: membership, role and environment access.
  const { project, membership, environment } = await authorizeEnvironment(
    userId,
    projectId,
    env,
    "secrets:create",
  );

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES)
    throw new ApiError(413, "The import is too large.");

  const body = await readBody(req);
  const raw = body.entries;
  if (!Array.isArray(raw) || raw.length === 0)
    throw new ApiError(400, "Provide at least one entry to import.");
  if (raw.length > MAX_ENTRIES)
    throw new ApiError(400, `At most ${MAX_ENTRIES} entries can be imported at once.`);

  // Validate every entry before touching anything. Messages name the position
  // and key, never the value.
  const seen = new Set<string>();
  const entries = raw.map((item, index) => {
    if (typeof item !== "object" || item === null)
      throw new ApiError(400, `Entry ${index + 1} is not valid.`);
    const e = item as Record<string, unknown>;
    let key: string;
    let value: string;
    try {
      key = parseSecretKey(e.key);
      value = parseSecretValue(e.value);
    } catch (err) {
      const why = err instanceof ApiError ? err.message : "Invalid entry.";
      throw new ApiError(400, `Entry ${index + 1}: ${why}`);
    }
    if (seen.has(key))
      throw new ApiError(400, `Key ${key} appears more than once.`);
    seen.add(key);
    return { key, value, overwrite: e.overwrite === true };
  });

  const { secrets } = await collections();
  const existing = new Map(
    (
      await secrets
        .find({ projectId: project._id, environmentId: environment._id })
        .toArray()
    ).map((s) => [s.key, s]),
  );

  // Overwriting needs the update permission as well. Checked for the whole
  // request before any write.
  if (
    entries.some((e) => existing.has(e.key) && e.overwrite) &&
    !can(membership.role, "secrets:update", { environment: env })
  )
    throw new ApiError(403, "You do not have permission to overwrite secrets.");

  const results: Result[] = [];

  for (const entry of entries) {
    const current = existing.get(entry.key);
    try {
      if (!current) {
        const created = await createSecretWithVersion({
          projectId: project._id,
          environmentId: environment._id,
          key: entry.key,
          plaintext: entry.value,
          actorId: userId,
        });
        await recordAudit({
          projectId: project._id,
          actorId: userId,
          action: "secret.created",
          targetType: "secret",
          targetId: created._id,
          metadata: { key: entry.key, environment: env, version: 1, via, import: true },
        });
        results.push({ key: entry.key, status: "created" });
        continue;
      }

      if (!entry.overwrite) {
        results.push({ key: entry.key, status: "skipped" });
        continue;
      }

      let same = false;
      try {
        same = decryptValue(current.value, current._id) === entry.value;
      } catch (err) {
        if (!(err instanceof DecryptionError)) throw err;
      }
      if (same) {
        results.push({ key: entry.key, status: "unchanged" });
        continue;
      }

      const saved = await writeNewVersion({
        secretId: current._id,
        projectId: project._id,
        environmentId: environment._id,
        plaintext: entry.value,
        actorId: userId,
        changeType: "UPDATED",
      });
      await recordAudit({
        projectId: project._id,
        actorId: userId,
        action: "secret.updated",
        targetType: "secret",
        targetId: current._id,
        metadata: {
          key: entry.key,
          environment: env,
          version: saved.version ?? 1,
          valueChanged: true,
          via,
          import: true,
        },
      });
      results.push({ key: entry.key, status: "updated" });
    } catch (err) {
      // Only a fixed description is returned, never the error text, which
      // could echo request data.
      results.push({
        key: entry.key,
        status: "failed",
        error: isDuplicateKeyError(err)
          ? "A secret with this key already exists."
          : err instanceof ApiError
            ? err.message
            : "Could not be saved.",
      });
    }
  }

  const summary = {
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated").length,
    unchanged: results.filter((r) => r.status === "unchanged").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  await recordAudit({
    projectId: project._id,
    actorId: userId,
    action: "secrets.imported",
    targetType: "environment",
    targetId: environment._id,
    metadata: { environment: env, via, total: entries.length, ...summary },
  });

  if (results.some((r) => r.status === "created" || r.status === "updated"))
    await (await collections()).projects.updateOne(
      { _id: project._id },
      { $set: { updatedAt: new Date() } },
    );

  if (summary.created + summary.updated > 0)
    await notifySecretsChanged(project._id, env, userId);

  return json({ summary, results });
});
