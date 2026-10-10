import "server-only";

/**
 * Single source of truth for what each project role may do.
 * Route handlers call authorizeProject() in lib/api.ts, which uses can() here.
 * The UI never decides on its own: the server sends each user's permission
 * list with the project and the UI only reflects it.
 */

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that can be handed out through invitations and role changes. */
export const ASSIGNABLE_ROLES = ["admin", "member", "viewer"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type Permission =
  | "project:read"
  | "project:update"
  | "project:delete"
  | "environments:manage"
  | "members:read"
  | "members:invite"
  | "members:update_role"
  | "members:remove"
  | "invitations:read"
  | "invitations:revoke"
  | "audit:read"
  | "integrations:manage"
  | "secrets:read"
  | "secrets:create"
  | "secrets:update"
  | "secrets:delete";

const SECRETS_RW: Permission[] = [
  "secrets:read",
  "secrets:create",
  "secrets:update",
  "secrets:delete",
];

const VIEWER: Permission[] = ["project:read", "members:read", "secrets:read"];
const MEMBER: Permission[] = [...VIEWER, ...SECRETS_RW];
const ADMIN: Permission[] = [
  ...MEMBER,
  "project:update",
  "environments:manage",
  "members:invite",
  "members:update_role",
  "members:remove",
  "invitations:read",
  "invitations:revoke",
  "audit:read",
  "integrations:manage",
];

const MATRIX: Record<Role, readonly Permission[]> = {
  viewer: VIEWER,
  member: MEMBER,
  admin: ADMIN,
  // Only the owner can delete the project. Ownership transfer is not built.
  owner: [...ADMIN, "project:delete"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isAssignableRole(value: unknown): value is AssignableRole {
  return (
    typeof value === "string" &&
    (ASSIGNABLE_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Extension point for environment level rules: role -> permission ->
 * environments where that permission is denied. Empty today, so every role
 * applies to every environment. Adding an entry here (or loading per
 * membership overrides) restricts access without touching any route handler,
 * since all of them pass the environment through can().
 */
const ENVIRONMENT_DENY: Partial<
  Record<Role, Partial<Record<Permission, readonly string[]>>>
> = {};

function environmentAllows(
  role: Role,
  permission: Permission,
  environment: string,
): boolean {
  return !ENVIRONMENT_DENY[role]?.[permission]?.includes(environment);
}

/**
 * How project roles combine with environment access.
 *
 * - owner and admin: implicit access to every environment (documented
 *   privilege; they can manage environment access, so this equals what they
 *   could grant themselves).
 * - member and viewer: no access to an environment without an explicit grant.
 *   Deny by default, including production.
 *
 * With access, the role's own permissions apply inside the environment, so
 * the effective permission is (role permission) AND (environment access).
 * A grant never raises a role: a viewer with a grant is still read-only.
 */
const FULL_ENVIRONMENT_ACCESS: readonly Role[] = ["owner", "admin"];

export type EnvironmentAccess = "implicit" | "granted" | "none";

export function environmentAccessFor(
  role: Role,
  hasGrant: boolean,
): EnvironmentAccess {
  if (FULL_ENVIRONMENT_ACCESS.includes(role)) return "implicit";
  return hasGrant ? "granted" : "none";
}

export function canHaveEnvironmentGrant(role: Role): boolean {
  return !FULL_ENVIRONMENT_ACCESS.includes(role);
}

export function can(
  role: Role,
  permission: Permission,
  context: { environment?: string } = {},
): boolean {
  if (!MATRIX[role]?.includes(permission)) return false;
  if (context.environment !== undefined)
    return environmentAllows(role, permission, context.environment);
  return true;
}

export function permissionsFor(role: Role): Permission[] {
  return [...(MATRIX[role] ?? [])];
}
