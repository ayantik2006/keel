import { randomUUID } from "node:crypto";
import { collections, type IntegrationDoc, type VercelTarget } from "@/lib/db";
import { encryptValue } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  authorizeProject,
  handler,
  json,
  readBody,
  requireUserId,
} from "@/lib/api";
import {
  PROJECT_ID,
  TEAM_ID,
  VercelError,
  getProject,
  getUser,
  validateDeployHook,
} from "@/lib/vercel";
import { refreshDeployment, tokenOf } from "@/lib/vercel-sync";

type Ctx = { params: Promise<{ projectId: string }> };

const TARGETS: VercelTarget[] = ["development", "preview", "production"];

/** Everything the UI may see. Never the token or the deploy hook. */
async function serialize(integ: IntegrationDoc) {
  const { environments } = await collections();
  const envs = await environments.find({ projectId: integ.projectId }).toArray();
  return {
    connected: true,
    status: integ.status,
    vercelProjectId: integ.vercelProjectId ?? null,
    vercelProjectName: integ.vercelProjectName ?? null,
    teamId: integ.teamId ?? null,
    mappings: integ.mappings,
    autoRedeploy: integ.autoRedeploy,
    hookConfigured: Boolean(integ.hookEnc),
    conflictPolicy: integ.conflictPolicy,
    lastSyncAt: integ.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: integ.lastSyncStatus ?? null,
    lastError: integ.lastError ?? null,
    lastRun: integ.lastRun
      ? { ...integ.lastRun, at: integ.lastRun.at.toISOString() }
      : null,
    lastDeployment: integ.lastDeployment
      ? {
          state: integ.lastDeployment.state,
          url: integ.lastDeployment.url ?? null,
          deploymentId: integ.lastDeployment.deploymentId ?? null,
          triggeredAt: integ.lastDeployment.triggeredAt.toISOString(),
        }
      : null,
    syncing: Boolean(integ.lockUntil && integ.lockUntil.getTime() > Date.now()),
    pending: integ.pendingEnvs?.length ?? 0,
    environments: envs.map((e) => e.slug),
  };
}

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "integrations:manage");

  const { integrations } = await collections();
  let integ = await integrations.findOne({ projectId, provider: "vercel" });
  if (!integ) return json({ connected: false });

  if (integ.status === "active" && integ.lastDeployment) {
    await refreshDeployment(integ);
    integ = (await integrations.findOne({ _id: integ._id })) ?? integ;
  }
  return json(await serialize(integ));
});

/** Connect (or reconnect) with an access token. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "integrations:manage");
  rateLimit(`vercel-connect:${userId}`, { limit: 10, windowMs: 60_000 });

  const body = await readBody(req);
  const token = body.token;
  if (typeof token !== "string" || token.trim().length < 8 || token.length > 500)
    throw new ApiError(400, "Enter a Vercel access token.");
  const teamId =
    typeof body.teamId === "string" && body.teamId.trim() ? body.teamId.trim() : undefined;
  if (teamId && !TEAM_ID.test(teamId))
    throw new ApiError(400, "Team ID should look like team_xxxxxxxx.");

  try {
    await getUser(token.trim());
  } catch (err) {
    if (err instanceof VercelError)
      throw new ApiError(err.needsAttention ? 400 : 502, err.message);
    throw err;
  }

  const { integrations } = await collections();
  const now = new Date();
  const existing = await integrations.findOne({ projectId, provider: "vercel" });
  const id = existing?._id ?? randomUUID();
  const tokenEnc = encryptValue(token.trim(), id);

  if (existing) {
    await integrations.updateOne(
      { _id: id },
      {
        $set: {
          tokenEnc,
          ...(teamId ? { teamId } : {}),
          status: existing.vercelProjectId ? "active" : "connected",
          updatedAt: now,
        },
        $unset: { lastError: "", ...(teamId ? {} : { teamId: "" }) },
      },
    );
  } else {
    await integrations.insertOne({
      _id: id,
      projectId,
      provider: "vercel",
      status: "connected",
      tokenEnc,
      ...(teamId ? { teamId } : {}),
      mappings: {},
      autoRedeploy: false,
      conflictPolicy: "skip",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }

  await recordAudit({
    projectId,
    actorId: userId,
    action: "integration.connected",
    targetType: "integration",
    targetId: id,
    metadata: { provider: "vercel", team: Boolean(teamId), reconnect: Boolean(existing) },
  });

  return json(await serialize((await integrations.findOne({ _id: id }))!), 201);
});

/** Link a Vercel project and set mappings and options. */
export const PUT = handler(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "integrations:manage");

  const { integrations, environments, integrationVars } = await collections();
  const integ = await integrations.findOne({ projectId, provider: "vercel" });
  if (!integ) throw new ApiError(404, "Connect Vercel first.");
  const body = await readBody(req);

  const vercelProjectId = body.vercelProjectId;
  if (typeof vercelProjectId !== "string" || !PROJECT_ID.test(vercelProjectId))
    throw new ApiError(400, "Choose a Vercel project.");
  const teamId =
    typeof body.teamId === "string" && body.teamId.trim() ? body.teamId.trim() : undefined;
  if (teamId && !TEAM_ID.test(teamId)) throw new ApiError(400, "Invalid team ID.");

  // Mappings: only this project's environments, valid targets, no two
  // environments onto one target (their variables would collide).
  const rawMappings = body.mappings;
  if (typeof rawMappings !== "object" || rawMappings === null || Array.isArray(rawMappings))
    throw new ApiError(400, "Provide environment mappings.");
  const projectEnvs = new Set(
    (await environments.find({ projectId }).toArray()).map((e) => e.slug),
  );
  const mappings: Record<string, VercelTarget> = {};
  const used = new Set<string>();
  for (const [env, target] of Object.entries(rawMappings as Record<string, unknown>)) {
    if (!projectEnvs.has(env)) throw new ApiError(400, `"${env.slice(0, 40)}" is not an environment of this project.`);
    if (typeof target !== "string" || !TARGETS.includes(target as VercelTarget))
      throw new ApiError(400, "Targets must be development, preview or production.");
    if (used.has(target))
      throw new ApiError(400, `Only one environment can map to ${target}.`);
    used.add(target);
    mappings[env] = target as VercelTarget;
  }
  if (Object.keys(mappings).length === 0)
    throw new ApiError(400, "Map at least one environment.");

  const conflictPolicy = body.conflictPolicy === "overwrite" ? "overwrite" : "skip";
  const autoRedeploy = body.autoRedeploy === true;

  let hookEnc = integ.hookEnc;
  if (body.deployHookUrl === null) {
    hookEnc = undefined;
  } else if (typeof body.deployHookUrl === "string" && body.deployHookUrl.trim()) {
    let hook: string;
    try {
      hook = validateDeployHook(body.deployHookUrl.trim());
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Invalid deploy hook.");
    }
    hookEnc = encryptValue(hook, `${integ._id}:hook`);
  }
  if (autoRedeploy && !hookEnc)
    throw new ApiError(400, "Add a deploy hook URL to enable automatic redeployment.");

  // The project must be reachable with the stored token.
  let name: string;
  try {
    name = (await getProject(await tokenOf(integ), vercelProjectId, teamId)).name;
  } catch (err) {
    if (err instanceof VercelError)
      throw new ApiError(err.kind === "not_found" ? 400 : 502, err.kind === "not_found" ? "That Vercel project was not found for this token." : err.message);
    throw err;
  }

  const changedProject =
    integ.vercelProjectId !== vercelProjectId ||
    (integ.teamId ?? null) !== (teamId ?? null);
  if (changedProject) await integrationVars.deleteMany({ integrationId: integ._id });

  await integrations.updateOne(
    { _id: integ._id },
    {
      $set: {
        vercelProjectId,
        vercelProjectName: name,
        ...(teamId ? { teamId } : {}),
        mappings,
        autoRedeploy,
        conflictPolicy,
        status: "active",
        updatedAt: new Date(),
        ...(hookEnc ? { hookEnc } : {}),
      },
      $unset: {
        ...(hookEnc ? {} : { hookEnc: "" }),
        ...(teamId ? {} : { teamId: "" }),
        ...(changedProject ? { lastRun: "", lastDeployment: "", lastSyncAt: "", lastSyncStatus: "", lastError: "" } : {}),
      },
    },
  );

  await recordAudit({
    projectId,
    actorId: userId,
    action: "integration.updated",
    targetType: "integration",
    targetId: integ._id,
    metadata: {
      provider: "vercel",
      vercelProject: name,
      mappings: Object.entries(mappings).map(([k, v]) => `${k}:${v}`).join(","),
      autoRedeploy,
      conflictPolicy,
      hookConfigured: Boolean(hookEnc),
    },
  });

  return json(await serialize((await integrations.findOne({ _id: integ._id }))!));
});

/**
 * Disconnect. Variables already in Vercel are left in place; Keel just stops
 * managing them.
 */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "integrations:manage");

  const { integrations, integrationVars } = await collections();
  const integ = await integrations.findOne({ projectId, provider: "vercel" });
  if (!integ) throw new ApiError(404, "Vercel is not connected.");

  await integrationVars.deleteMany({ integrationId: integ._id });
  await integrations.deleteOne({ _id: integ._id });
  await recordAudit({
    projectId,
    actorId: userId,
    action: "integration.disconnected",
    targetType: "integration",
    targetId: integ._id,
    metadata: { provider: "vercel", vercelProject: integ.vercelProjectName ?? null },
  });
  return json({ ok: true });
});
