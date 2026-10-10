import { collections } from "@/lib/db";
import { DecryptionError, decryptValue } from "@/lib/crypto";
import {
  VersionConflictError,
  currentVersionOf,
  writeNewVersion,
} from "@/lib/secret-versions";
import type { Permission } from "@/lib/permissions";
import { recordAudit, recordAuditOnce } from "@/lib/audit";
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

type Ctx = {
  params: Promise<{ projectId: string; env: string; secretId: string }>;
};

/**
 * Resolves a secret only through a project and environment the caller has the
 * given permission on. Authorization happens before the secret is read, and
 * decryption only happens in handlers after this returns.
 */
async function loadSecret(
  userId: string,
  ctx: Awaited<Ctx["params"]>,
  permission: Permission,
) {
  const { project, environment } = await authorizeEnvironment(
    userId,
    ctx.projectId,
    ctx.env,
    permission,
  );
  const { secrets, projects } = await collections();
  const secret = await secrets.findOne({
    _id: ctx.secretId,
    projectId: project._id,
    environmentId: environment._id,
  });
  if (!secret) throw new ApiError(404, "Secret not found.");
  return { project, environment, secret, secrets, projects };
}

/** Returns the decrypted value for one secret. */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const { userId, via } = await requireAuth({ allowCli: true });
  const ctx = await params;
  const { secret } = await loadSecret(userId, ctx, "secrets:read");
  let value: string;
  try {
    value = decryptValue(secret.value, secret._id);
  } catch (err) {
    if (err instanceof DecryptionError) {
      // Fail closed. Log the id only, never the payload.
      console.error("Decryption failed for secret", secret._id);
      throw new ApiError(500, "This secret could not be decrypted.");
    }
    throw err;
  }
  // A value left the server. Repeated reads by the same person within a
  // minute (copy after reveal, say) are recorded once.
  await recordAuditOnce({
    projectId: secret.projectId,
    actorId: userId,
    action: "secret.revealed",
    targetType: "secret",
    targetId: secret._id,
    metadata: { key: secret.key, environment: ctx.env, via },
  });
  return json({
    secret: {
      id: secret._id,
      key: secret.key,
      value,
      version: currentVersionOf(secret),
      updatedAt: secret.updatedAt.toISOString(),
    },
  });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { userId, via } = await requireAuth({ allowCli: true });
  const ctx = await params;
  const { project, secret, secrets, projects } = await loadSecret(
    userId,
    ctx,
    "secrets:update",
  );
  const body = await readBody(req);
  if (!("key" in body) && !("value" in body))
    throw new ApiError(400, "Nothing to update.");

  const key = "key" in body ? parseSecretKey(body.key) : undefined;
  let value = "value" in body ? parseSecretValue(body.value) : undefined;
  // Saving an unchanged value is not a new version (e.g. a key-only rename
  // submitted through the edit form).
  if (value !== undefined) {
    try {
      if (decryptValue(secret.value, secret._id) === value) value = undefined;
    } catch {
      // Undecryptable current value: fall through and write the new one.
    }
  }
  if (value === undefined && key === undefined)
    return json({ secret: serializeSecret(secret) });
  let expectedVersion: number | undefined;
  if ("expectedVersion" in body) {
    const v = body.expectedVersion;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1)
      throw new ApiError(400, "expectedVersion must be a positive integer.");
    expectedVersion = v;
  }

  const audit = (saved: { key: string; version?: number }, valueChanged: boolean) =>
    recordAudit({
      projectId: project._id,
      actorId: userId,
      action: "secret.updated",
      targetType: "secret",
      targetId: secret._id,
      metadata: {
        key: saved.key,
        environment: ctx.env,
        version: saved.version ?? 1,
        valueChanged,
        via,
      },
    });

  try {
    if (value !== undefined) {
      // A value change is a new version, written with compare-and-set.
      const saved = await writeNewVersion({
        secretId: secret._id,
        projectId: project._id,
        environmentId: secret.environmentId,
        plaintext: value,
        key,
        actorId: userId,
        changeType: "UPDATED",
        expectedVersion,
      });
      await audit(saved, true);
      await notifySecretsChanged(project._id, ctx.env, userId);
      return json({ secret: serializeSecret(saved) });
    }

    // Key rename only: not a new version of the value.
    if (
      expectedVersion !== undefined &&
      expectedVersion !== currentVersionOf(secret)
    )
      throw new VersionConflictError();
    const now = new Date();
    await secrets.updateOne(
      {
        _id: secret._id,
        projectId: project._id,
        environmentId: secret.environmentId,
      },
      { $set: { key, updatedAt: now } },
    );
    await projects.updateOne({ _id: project._id }, { $set: { updatedAt: now } });
    await audit({ key: key!, version: secret.version }, false);
    await notifySecretsChanged(project._id, ctx.env, userId);
    return json({
      secret: serializeSecret({ ...secret, key: key!, updatedAt: now }),
    });
  } catch (err) {
    if (isDuplicateKeyError(err))
      throw new ApiError(
        409,
        "A secret with this key already exists in this environment.",
      );
    throw err;
  }
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { userId } = await requireAuth(); // browser sessions only
  const ctx = await params;
  const { project, secret, secrets, projects } = await loadSecret(
    userId,
    ctx,
    "secrets:delete",
  );
  const { secretVersions } = await collections();
  await secrets.deleteOne({
    _id: secret._id,
    projectId: project._id,
    environmentId: secret.environmentId,
  });
  // History of a deleted secret is not reachable, so it is removed with it.
  await secretVersions.deleteMany({ secretId: secret._id });
  await projects.updateOne(
    { _id: project._id },
    { $set: { updatedAt: new Date() } },
  );
  await recordAudit({
    projectId: project._id,
    actorId: userId,
    action: "secret.deleted",
    targetType: "secret",
    targetId: secret._id,
    metadata: { key: secret.key, environment: ctx.env, via: "web" },
  });
  await notifySecretsChanged(project._id, ctx.env, userId);
  return json({ ok: true });
});
