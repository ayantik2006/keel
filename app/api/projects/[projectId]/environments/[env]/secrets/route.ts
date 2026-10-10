import { collections } from "@/lib/db";
import { createSecretWithVersion } from "@/lib/secret-versions";
import { recordAudit } from "@/lib/audit";
import { notifySecretsChanged } from "@/lib/vercel-sync";
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
  serializeSecret,
} from "@/lib/api";

type Ctx = { params: Promise<{ projectId: string; env: string }> };

/** Lists secret metadata only. Values are fetched one at a time on demand. */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const { userId } = await requireAuth({ allowCli: true });
  const { projectId, env } = await params;
  const { environment } = await authorizeEnvironment(
    userId,
    projectId,
    env,
    "secrets:read",
  );

  const { secrets } = await collections();
  const docs = await secrets
    .find(
      { projectId, environmentId: environment._id },
      { projection: { value: 0 } },
    )
    .sort({ updatedAt: -1 })
    .toArray();

  return json({
    secrets: docs.map(serializeSecret),
  });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const { userId, via } = await requireAuth({ allowCli: true });
  const { projectId, env } = await params;
  const { project, environment } = await authorizeEnvironment(
    userId,
    projectId,
    env,
    "secrets:create",
  );
  const body = await readBody(req);
  const key = parseSecretKey(body.key);
  const value = parseSecretValue(body.value);

  const { projects } = await collections();

  let created;
  try {
    created = await createSecretWithVersion({
      projectId: project._id,
      environmentId: environment._id,
      key,
      plaintext: value,
      actorId: userId,
    });
  } catch (err) {
    if (isDuplicateKeyError(err))
      throw new ApiError(
        409,
        "A secret with this key already exists in this environment.",
      );
    throw err;
  }
  await projects.updateOne(
    { _id: project._id },
    { $set: { updatedAt: created.createdAt } },
  );

  await recordAudit({
    projectId: project._id,
    actorId: userId,
    action: "secret.created",
    targetType: "secret",
    targetId: created._id,
    metadata: { key, environment: env, version: 1, via },
  });

  await notifySecretsChanged(project._id, env, userId);
  return json({ secret: serializeSecret(created) }, 201);
});
