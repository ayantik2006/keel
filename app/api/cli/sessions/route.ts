import { collections } from "@/lib/db";
import { handler, json, requireUserId } from "@/lib/api";
import { revokeAllSessions } from "@/lib/cli-auth";

/** The signed-in user's active CLI sessions. Never includes token material. */
export const GET = handler(async () => {
  const userId = await requireUserId();
  const { cliSessions } = await collections();
  const now = new Date();
  const docs = await cliSessions
    .find({
      userId,
      revokedAt: { $exists: false },
      refreshExpiresAt: { $gt: now },
    })
    .sort({ lastUsedAt: -1 })
    .toArray();
  return json({
    sessions: docs.map((s) => ({
      id: s._id,
      deviceName: s.deviceName,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.refreshExpiresAt.toISOString(),
    })),
  });
});

/** Browser session only: sign out every CLI on every machine. */
export const DELETE = handler(async () => {
  const userId = await requireUserId();
  const revoked = await revokeAllSessions(userId);
  return json({ revoked });
});
