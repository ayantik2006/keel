import "server-only";
import { collections, type EnvironmentDoc } from "./db";
import { environmentAccessFor, type EnvironmentAccess, type Role } from "./permissions";

/** Environment ids the user has been explicitly granted, across projects. */
export async function grantedEnvironmentIds(
  userId: string,
  projectIds: string[],
): Promise<Set<string>> {
  const { environmentAccess } = await collections();
  const grants = await environmentAccess
    .find({ userId, projectId: { $in: projectIds } })
    .toArray();
  return new Set(grants.map((g) => g.environmentId));
}

/** The one place that decides a user's access to a single environment. */
export async function resolveEnvironmentAccess(
  userId: string,
  role: Role,
  projectId: string,
  environmentId: string,
): Promise<EnvironmentAccess> {
  const implicit = environmentAccessFor(role, false);
  if (implicit === "implicit") return implicit;
  const { environmentAccess } = await collections();
  const grant = await environmentAccess.findOne({
    projectId,
    environmentId,
    userId,
  });
  return environmentAccessFor(role, grant !== null);
}

/** Environments the role may see. Members and viewers only see granted ones. */
export function visibleEnvironments(
  role: Role,
  environments: EnvironmentDoc[],
  granted: Set<string>,
): EnvironmentDoc[] {
  return environments.filter(
    (e) => environmentAccessFor(role, granted.has(e._id)) !== "none",
  );
}
