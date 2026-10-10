import { collections } from "@/lib/db";
import {
  authorizeSecret,
  handler,
  json,
  requireUserId,
} from "@/lib/api";
import { currentVersionOf, recordCurrentVersion } from "@/lib/secret-versions";

type Ctx = {
  params: Promise<{ projectId: string; env: string; secretId: string }>;
};

/** Version metadata only. Values are never part of this response. */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { secret } = await authorizeSecret(userId, await params, "secrets:read");

  // Repairs a missing record for the current state (including the baseline
  // for secrets that predate history). Idempotent.
  await recordCurrentVersion(secret);

  const { secretVersions, memberships } = await collections();
  const docs = await secretVersions
    .find({ secretId: secret._id }, { projection: { value: 0 } })
    .sort({ versionNumber: -1 })
    .toArray()
    .then((rows) => {
      // Defensive: one row per version number even if a stray copy exists.
      const seen = new Set<number>();
      return rows.filter((r) =>
        seen.has(r.versionNumber) ? false : !!seen.add(r.versionNumber),
      );
    });

  const actorIds = [
    ...new Set(docs.map((d) => d.actorId).filter((a): a is string => !!a)),
  ];
  const people = await memberships
    .find({ projectId: secret.projectId, userId: { $in: actorIds } })
    .toArray();
  const emailOf = new Map(people.map((m) => [m.userId, m.email ?? null]));
  const current = currentVersionOf(secret);

  return json({
    currentVersion: current,
    versions: docs.map((d) => ({
      versionNumber: d.versionNumber,
      changeType: d.changeType,
      key: d.key,
      isCurrent: d.versionNumber === current,
      restoredFromVersion: d.restoredFromVersion ?? null,
      createdAt: d.createdAt.toISOString(),
      changedBy: d.actorId
        ? {
            userId: d.actorId,
            email: emailOf.get(d.actorId) ?? null,
            isYou: d.actorId === userId,
            // false when the person is no longer a project member
            isMember: emailOf.has(d.actorId),
          }
        : null,
    })),
  });
});
