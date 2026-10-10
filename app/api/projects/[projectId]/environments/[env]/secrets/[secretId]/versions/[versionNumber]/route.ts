import { collections } from "@/lib/db";
import { recordAuditOnce } from "@/lib/audit";
import { DecryptionError, decryptValue } from "@/lib/crypto";
import {
  ApiError,
  authorizeSecret,
  handler,
  json,
  parseVersionNumber,
  requireUserId,
} from "@/lib/api";

type Ctx = {
  params: Promise<{
    projectId: string;
    env: string;
    secretId: string;
    versionNumber: string;
  }>;
};

/**
 * Reveals one historical value. Same gate as reading the current value:
 * project permission, environment access, and the secret resolved through its
 * own project and environment, all before decryption.
 */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const ctx = await params;
  const { secret } = await authorizeSecret(userId, ctx, "secrets:read");
  const versionNumber = parseVersionNumber(ctx.versionNumber);

  const { secretVersions } = await collections();
  const version = await secretVersions.findOne({
    secretId: secret._id,
    projectId: secret.projectId,
    environmentId: secret.environmentId,
    versionNumber,
  });
  if (!version) throw new ApiError(404, "Version not found.");

  try {
    const value = decryptValue(version.value, secret._id);
    await recordAuditOnce({
      projectId: secret.projectId,
      actorId: userId,
      action: "secret.version_revealed",
      targetType: "secret",
      targetId: secret._id,
      metadata: { key: secret.key, version: versionNumber, environment: ctx.env },
    });
    return json({ version: { versionNumber, value } });
  } catch (err) {
    if (err instanceof DecryptionError) {
      console.error(
        "Decryption failed for secret version",
        secret._id,
        versionNumber,
      );
      throw new ApiError(500, "This version could not be decrypted.");
    }
    throw err;
  }
});
