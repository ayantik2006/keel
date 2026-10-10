import { collections } from "@/lib/db";
import {
  authorizeProject,
  ENV_SLUGS,
  handler,
  json,
  requireUserId,
} from "@/lib/api";
import { environmentAccessFor, permissionsFor } from "@/lib/permissions";

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * Access matrix for administrators: for every member and environment, whether
 * access is implicit (owner/admin), explicitly granted, or absent.
 */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "environments:manage");

  const { memberships, environments, environmentAccess } = await collections();
  const [members, envs, grants] = await Promise.all([
    memberships.find({ projectId }).sort({ createdAt: 1 }).toArray(),
    environments.find({ projectId }).toArray(),
    environmentAccess.find({ projectId }).toArray(),
  ]);
  const granted = new Set(grants.map((g) => `${g.environmentId}:${g.userId}`));
  const slugs = ENV_SLUGS.filter((s) => envs.some((e) => e.slug === s));

  return json({
    environments: slugs,
    members: members.map((m) => ({
      userId: m.userId,
      email: m.email,
      role: m.role,
      isYou: m.userId === userId,
      // What the role can do inside an environment it can access.
      secretPermissions: permissionsFor(m.role).filter((p) =>
        p.startsWith("secrets:"),
      ),
      access: Object.fromEntries(
        slugs.map((slug) => {
          const env = envs.find((e) => e.slug === slug)!;
          return [
            slug,
            environmentAccessFor(m.role, granted.has(`${env._id}:${m.userId}`)),
          ];
        }),
      ),
    })),
  });
});
