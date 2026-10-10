import { collections } from "@/lib/db";
import {
  CURRENT_VERSION,
  assertEncryptionConfig,
} from "@/lib/crypto";
import { authorizeProject, handler, json, requireUserId } from "@/lib/api";

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * A read-only security overview derived from the real state of the project.
 * It reports facts and counts only: never key material, secret values, tokens
 * or integration credentials. Owners and admins only.
 */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "audit:read");

  const {
    secrets,
    memberships,
    invitations,
    environments,
    environmentAccess,
    auditLogs,
    integrations,
  } = await collections();

  let keyConfigured = true;
  try {
    assertEncryptionConfig();
  } catch {
    keyConfigured = false; // the reason is deliberately not returned
  }

  const [byKeyVersion, members, pending, envs, grants, events, vercel] =
    await Promise.all([
      secrets
        .aggregate<{ _id: number | null; n: number }>([
          { $match: { projectId } },
          { $group: { _id: "$value.v", n: { $sum: 1 } } },
        ])
        .toArray(),
      memberships.find({ projectId }).toArray(),
      invitations.countDocuments({
        projectId,
        status: "pending",
        expiresAt: { $gt: new Date() },
      }),
      environments.find({ projectId }).toArray(),
      environmentAccess.find({ projectId }).toArray(),
      auditLogs.countDocuments({ projectId }),
      integrations.findOne(
        { projectId, provider: "vercel" },
        { projection: { status: 1, vercelProjectName: 1 } },
      ),
    ]);

  const total = byKeyVersion.reduce((n, g) => n + g.n, 0);
  const onCurrent = byKeyVersion.find((g) => g._id === CURRENT_VERSION)?.n ?? 0;

  const roleCounts = { owner: 0, admin: 0, member: 0, viewer: 0 };
  for (const m of members) roleCounts[m.role]++;

  const restricted = roleCounts.member + roleCounts.viewer;
  const grantCount = new Map<string, number>();
  for (const g of grants)
    grantCount.set(g.environmentId, (grantCount.get(g.environmentId) ?? 0) + 1);

  return json({
    encryption: {
      algorithm: "AES-256-GCM",
      secretsEncryptedAtRest: true,
      keyConfigured,
      currentKeyVersion: CURRENT_VERSION,
      keyStorage: "Server environment variable, never stored in the database",
      records: { total, onCurrentKeyVersion: onCurrent, other: total - onCurrent },
      keyRotation: false,
      externalKms: false,
    },
    authentication: {
      provider: "Clerk",
      note: "Sign-in, passwords and browser sessions are managed by the authentication provider.",
      cliAccessTokenMinutes: 60,
      cliRefreshTokenDays: 30,
    },
    access: {
      members: roleCounts,
      pendingInvitations: pending,
      environments: envs
        .map((e) => ({
          slug: e.slug,
          membersAndViewersWithAccess: grantCount.get(e._id) ?? 0,
          membersAndViewersTotal: restricted,
        }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    },
    integrations: {
      vercel: vercel
        ? { status: vercel.status, project: vercel.vercelProjectName ?? null }
        : null,
    },
    auditLog: { events, retention: "Kept until the project is deleted" },
  });
});
