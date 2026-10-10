import { collections } from "@/lib/db";
import { ApiError, handler, json, requireUserId } from "@/lib/api";

type Ctx = { params: Promise<{ sessionId: string }> };

/** Revokes one of the signed-in user's own CLI sessions. Browser session only. */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { sessionId } = await params;

  const { cliSessions } = await collections();
  const result = await cliSessions.updateOne(
    { _id: sessionId, userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  if (result.matchedCount === 0) throw new ApiError(404, "Session not found.");
  return json({ ok: true });
});
