import "server-only";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { verifyAccessToken } from "./cli-auth";
import {
  collections,
  type EnvironmentDoc,
  type MembershipDoc,
  type ProjectDoc,
  type SecretDoc,
} from "./db";
import { recordAuditOnce } from "./audit";
import { resolveEnvironmentAccess } from "./environment-access";
import { can, isAssignableRole, permissionsFor, type AssignableRole, type Permission } from "./permissions";

export const ENV_SLUGS = ["development", "staging", "production"] as const;

const ENV_NAMES: Record<string, string> = {
  development: "Development",
  staging: "Staging",
  production: "Production",
};
export const envName = (slug: string) => ENV_NAMES[slug] ?? slug;

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a handler so ApiError becomes a JSON response and nothing else leaks. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.message }, err.status);
      // Log the error name only. Messages and payloads could contain secrets.
      console.error("API error:", err instanceof Error ? err.name : "unknown");
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export type AuthContext = {
  userId: string;
  /** How the caller authenticated. */
  via: "web" | "cli";
};

/**
 * Resolves the caller. Browser sessions (Clerk) work everywhere. A CLI bearer
 * token is accepted only by routes that opt in with `allowCli`, so a CLI
 * credential cannot reach member management, invitations, deletion and so on.
 * A CLI token that is invalid is rejected outright; it never falls back to
 * cookies. Authorization (membership, role, environment) is applied afterwards
 * exactly as for browser users.
 */
export async function requireAuth(
  opts: { allowCli?: boolean } = {},
): Promise<AuthContext> {
  const authorization = (await headers()).get("authorization");
  // Only our own CLI tokens (prefix keel_) are handled here. Any other
  // Authorization header is ignored and the browser session applies.
  if (authorization && /^Bearer\s+keel_/i.test(authorization)) {
    if (!opts.allowCli)
      throw new ApiError(
        403,
        "CLI credentials cannot be used for this operation.",
      );
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    const session = match ? await verifyAccessToken(match[1]) : null;
    if (!session)
      throw new ApiError(
        401,
        "Your CLI session has expired or was revoked. Run `keel login`.",
      );
    return { userId: session.userId, via: "cli" };
  }

  const { userId } = await auth();
  if (!userId) throw new ApiError(401, "You need to sign in.");
  return { userId, via: "web" };
}

/** Browser-session only. Use requireAuth({ allowCli: true }) to accept the CLI. */
export async function requireUserId(): Promise<string> {
  return (await requireAuth()).userId;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json.");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

/**
 * The one authorization gate for project-scoped operations. Every protected
 * route calls this (or authorizeEnvironment) before touching data.
 *
 * - No membership: 404, so project ids cannot be probed.
 * - Membership without the permission: 403.
 * The project id is only ever used to look up the caller's own membership.
 */
export async function authorizeProject(
  userId: string,
  projectId: string,
  permission: Permission,
  context: { environment?: string } = {},
): Promise<{ project: ProjectDoc; membership: MembershipDoc }> {
  const { memberships, projects } = await collections();
  const membership = await memberships.findOne({ projectId, userId });
  if (!membership) throw new ApiError(404, "Project not found.");
  if (!can(membership.role, permission, context))
    throw new ApiError(403, "You do not have permission to do this.");
  const project = await projects.findOne({ _id: projectId });
  if (!project) throw new ApiError(404, "Project not found.");
  return { project, membership };
}

/** Authorizes a permission against one environment of a project. */
export async function authorizeEnvironment(
  userId: string,
  projectId: string,
  slug: string,
  permission: Permission,
): Promise<{
  project: ProjectDoc;
  membership: MembershipDoc;
  environment: EnvironmentDoc;
}> {
  const { project, membership } = await authorizeProject(
    userId,
    projectId,
    permission,
    { environment: slug },
  );
  const { environments } = await collections();
  const environment = await environments.findOne({
    projectId: project._id,
    slug,
  });
  if (!environment) throw new ApiError(404, "Environment not found.");

  // Environment gate: owners and admins pass; members and viewers need an
  // explicit grant. Runs before any secret is read, so before any decryption.
  const access = await resolveEnvironmentAccess(
    userId,
    membership.role,
    project._id,
    environment._id,
  );
  if (access === "none") {
    await recordAuditOnce({
      projectId: project._id,
      actorId: userId,
      action: "environment.access_denied",
      targetType: "environment",
      targetId: environment._id,
      metadata: { environment: slug, permission, role: membership.role },
    });
    throw new ApiError(403, "You do not have access to this environment.");
  }
  return { project, membership, environment };
}

/** Secret metadata only. Never includes the value. */
export function serializeSecret(
  s: Pick<SecretDoc, "_id" | "key" | "version" | "createdAt" | "updatedAt">,
) {
  return {
    id: s._id,
    key: s.key,
    version: s.version ?? 1,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function parseEmail(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "Email is required.");
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    throw new ApiError(400, "Enter a valid email address.");
  return email;
}

export function parseAssignableRole(value: unknown): AssignableRole {
  if (!isAssignableRole(value))
    throw new ApiError(400, "Role must be admin, member, or viewer.");
  return value;
}

export function parseProjectName(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError(400, "Project name is required.");
  const name = value.trim();
  if (name.length > 60)
    throw new ApiError(400, "Project name must be 60 characters or fewer.");
  return name;
}

export function parseDescription(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string")
    throw new ApiError(400, "Description must be text.");
  const description = value.trim();
  if (description.length > 280)
    throw new ApiError(400, "Description must be 280 characters or fewer.");
  return description || undefined;
}

export function parseEnvironments(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new ApiError(400, "Select at least one environment.");
  const slugs = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string" || !(ENV_SLUGS as readonly string[]).includes(v))
      throw new ApiError(400, "Unknown environment.");
    slugs.add(v);
  }
  return ENV_SLUGS.filter((s) => slugs.has(s));
}

/** Optional list of environment slugs on an invitation. Empty means none. */
export function parseInviteEnvironments(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > ENV_SLUGS.length)
    throw new ApiError(400, "Environments must be a list.");
  const slugs = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string" || !(ENV_SLUGS as readonly string[]).includes(v))
      throw new ApiError(400, "Unknown environment.");
    slugs.add(v);
  }
  return ENV_SLUGS.filter((s) => slugs.has(s));
}

export function parseSecretKey(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError(400, "Key is required.");
  const key = value.trim();
  if (key.length > 128)
    throw new ApiError(400, "Key must be 128 characters or fewer.");
  if (!KEY_PATTERN.test(key))
    throw new ApiError(
      400,
      "Use letters, numbers, and underscores. Cannot start with a number.",
    );
  return key;
}

export function parseSecretValue(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    throw new ApiError(400, "Value is required.");
  if (value.length > 10_000)
    throw new ApiError(400, "Value must be 10,000 characters or fewer.");
  return value;
}

export function isDuplicateKeyError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

export function serializeProject(
  project: ProjectDoc,
  environments: EnvironmentDoc[],
  counts: Record<string, number>,
  membership: Pick<MembershipDoc, "role">,
) {
  return {
    id: project._id,
    role: membership.role,
    /** What the signed-in user may do. The UI only reflects this list. */
    permissions: permissionsFor(membership.role),
    name: project.name,
    description: project.description,
    environments: ENV_SLUGS.filter((s) =>
      environments.some((e) => e.slug === s),
    ),
    secretCounts: Object.fromEntries(
      environments.map((e) => [e.slug, counts[e._id] ?? 0]),
    ),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/**
 * Resolves a secret strictly through its project and environment, after the
 * project permission and the environment access check have passed. Used by
 * every route that touches one secret (value, versions, rollback).
 */
export async function authorizeSecret(
  userId: string,
  ids: { projectId: string; env: string; secretId: string },
  permission: Permission,
) {
  const { project, membership, environment } = await authorizeEnvironment(
    userId,
    ids.projectId,
    ids.env,
    permission,
  );
  const { secrets } = await collections();
  const secret = await secrets.findOne({
    _id: ids.secretId,
    projectId: project._id,
    environmentId: environment._id,
  });
  if (!secret) throw new ApiError(404, "Secret not found.");
  return { project, membership, environment, secret };
}

export function parseVersionNumber(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || String(n) !== value)
    throw new ApiError(404, "Version not found.");
  return n;
}

/** Loads environments and per-environment secret counts for projects. */
export async function loadProjectDetails(projectIds: string[]) {
  const { environments, secrets } = await collections();
  const [envs, counts] = await Promise.all([
    environments.find({ projectId: { $in: projectIds } }).toArray(),
    secrets
      .aggregate<{ _id: string; n: number }>([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: "$environmentId", n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  return {
    envs,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  };
}
