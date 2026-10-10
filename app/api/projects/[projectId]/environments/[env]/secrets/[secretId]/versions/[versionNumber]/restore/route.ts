import { collections } from "@/lib/db";
import { DecryptionError, decryptValue } from "@/lib/crypto";
import {
  ApiError,
  authorizeSecret,
  handler,
  json,
  parseVersionNumber,
  readBody,
  requireUserId,
  serializeSecret,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { notifySecretsChanged } from "@/lib/vercel-sync";
import { currentVersionOf, writeNewVersion } from "@/lib/secret-versions";

type Ctx = {
  params: Promise<{
    projectId: string;
    env: string;
    secretId: string;
    versionNumber: string;
  }>;
};

/**
 * Restores an older value as a NEW version. History is never rewritten: the
 * restored value becomes version N+1 and every earlier version stays.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const ctx = await params;
  // Rechecks project role and environment access on the server.
  const { secret } = await authorizeSecret(userId, ctx, "secrets:update");
  const target = parseVersionNumber(ctx.versionNumber);
  const body = await readBody(req);

  let expectedVersion: number | undefined;
  if (body.expectedVersion !== undefined) {
    const v = body.expectedVersion;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1)
      throw new ApiError(400, "expectedVersion must be a positive integer.");
    expectedVersion = v;
  }

  if (target === currentVersionOf(secret))
    throw new ApiError(400, "This version is already the current value.");

  const { secretVersions } = await collections();
  const version = await secretVersions.findOne({
    secretId: secret._id,
    projectId: secret.projectId,
    environmentId: secret.environmentId,
    versionNumber: target,
  });
  if (!version) throw new ApiError(404, "Version not found.");

  let plaintext: string;
  try {
    plaintext = decryptValue(version.value, secret._id);
  } catch (err) {
    if (err instanceof DecryptionError) {
      console.error("Decryption failed for secret version", secret._id, target);
      throw new ApiError(500, "This version could not be decrypted.");
    }
    throw err;
  }

  // Re-encrypted under the current key version with a fresh nonce.
  const saved = await writeNewVersion({
    secretId: secret._id,
    projectId: secret.projectId,
    environmentId: secret.environmentId,
    plaintext,
    actorId: userId,
    changeType: "ROLLED_BACK",
    restoredFromVersion: target,
    expectedVersion,
  });

  await recordAudit({
    projectId: secret.projectId,
    actorId: userId,
    action: "secret.rolled_back",
    targetType: "secret",
    targetId: secret._id,
    metadata: {
      key: saved.key,
      restoredFromVersion: target,
      newVersion: currentVersionOf(saved),
      environment: ctx.env,
    },
  });

  await notifySecretsChanged(secret.projectId, ctx.env, userId);
  return json({ secret: serializeSecret(saved) });
});
