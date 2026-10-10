import { collections } from "@/lib/db";
import { DecryptionError, decryptValue } from "@/lib/crypto";
import {
  ApiError,
  authorizeEnvironment,
  handler,
  json,
  requireAuth,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { exportFilename, serializeDotenv } from "@/lib/dotenv";

type Ctx = { params: Promise<{ projectId: string; env: string }> };

/**
 * Returns every secret of one environment with decrypted values, for the CLI
 * runtime injection and for revealed listings.
 *
 * Authorization (project membership, role, environment access) runs before any
 * decryption. If any single secret cannot be decrypted the whole request fails
 * closed rather than returning a partial environment. Every call is audited
 * with the key count, never the values.
 */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const { userId, via } = await requireAuth({ allowCli: true });
  const asDotenv = new URL(req.url).searchParams.get("format") === "dotenv";
  rateLimit(`export:${userId}`, { limit: 30, windowMs: 60_000 });
  const { projectId, env } = await params;
  const { project, environment } = await authorizeEnvironment(
    userId,
    projectId,
    env,
    "secrets:read",
  );

  const { secrets } = await collections();
  const docs = await secrets
    .find({ projectId: project._id, environmentId: environment._id })
    .sort({ key: 1 })
    .toArray();

  let decrypted: { key: string; value: string }[];
  try {
    decrypted = docs.map((s) => ({
      key: s.key,
      value: decryptValue(s.value, s._id),
    }));
  } catch (err) {
    if (err instanceof DecryptionError) {
      console.error("Decryption failed during export for project", project._id);
      throw new ApiError(500, "Some secrets could not be decrypted.");
    }
    throw err;
  }

  await recordAudit({
    projectId: project._id,
    actorId: userId,
    action: "secrets.exported",
    targetType: "environment",
    targetId: environment._id,
    metadata: {
      environment: env,
      count: decrypted.length,
      via,
      format: asDotenv ? "dotenv" : "json",
    },
  });

  if (asDotenv) {
    // Generated in memory and streamed; nothing is stored on the server.
    return new Response(serializeDotenv(decrypted), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(env)}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return json({ secrets: decrypted });
});
