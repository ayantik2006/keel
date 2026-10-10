import "server-only";

/**
 * Minimal Vercel REST client. Server side only.
 *
 * - The base URL is fixed; callers cannot point it elsewhere.
 * - Every request has a timeout. Transient failures (network, 5xx, 429) are
 *   retried a few times with backoff; auth, permission, validation and
 *   not-found errors are permanent and never retried.
 * - Errors carry a `kind` and a fixed message. Response bodies are never put
 *   into messages, so a secret or token cannot travel through an error.
 */

const BASE = "https://api.vercel.com";
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const MAX_PAGES = 20;

export type VercelErrorKind =
  | "auth"
  | "permission"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "server"
  | "network";

const MESSAGES: Record<VercelErrorKind, string> = {
  auth: "Vercel rejected the access token. It may be invalid, expired or revoked.",
  permission: "The Vercel token does not have permission for this action.",
  not_found: "Vercel could not find that project or variable.",
  validation: "Vercel rejected the request.",
  conflict: "Vercel reported a conflicting variable.",
  rate_limited: "Vercel is rate limiting requests. Try again shortly.",
  server: "Vercel is having problems. Try again shortly.",
  network: "Could not reach Vercel.",
};

export class VercelError extends Error {
  constructor(
    public kind: VercelErrorKind,
    public status?: number,
  ) {
    super(MESSAGES[kind]);
    this.name = "VercelError";
  }
  /** Authentication problems mean the integration needs the user's attention. */
  get needsAttention() {
    return this.kind === "auth" || this.kind === "permission";
  }
}

function kindFor(status: number): VercelErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "validation";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryBase = () => Number(process.env.VERCEL_RETRY_DELAY_MS ?? 500);

type Query = Record<string, string | number | undefined>;

async function call<T>(
  token: string,
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(opts.query ?? {}))
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

  let last: VercelError = new VercelError("network");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      last = new VercelError("network");
      if (attempt < MAX_ATTEMPTS) {
        await sleep(retryBase() * attempt);
        continue;
      }
      throw last;
    }

    if (res.ok) {
      if (res.status === 204) return {} as T;
      return (await res.json().catch(() => ({}))) as T;
    }

    const error = new VercelError(kindFor(res.status), res.status);
    const transient = error.kind === "server" || error.kind === "rate_limited";
    if (!transient || attempt === MAX_ATTEMPTS) throw error;
    last = error;
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 5000)
      : retryBase() * attempt;
    await sleep(wait);
  }
  throw last;
}

export const TEAM_ID = /^team_[A-Za-z0-9]{1,64}$/;
export const PROJECT_ID = /^prj_[A-Za-z0-9]{1,64}$/;

const scope = (teamId?: string): Query => (teamId ? { teamId } : {});
const enc = encodeURIComponent;

export type VercelProject = { id: string; name: string };
export type VercelEnvVar = {
  id: string;
  key: string;
  target: string[];
  gitBranch?: string | null;
};

export async function getUser(token: string) {
  const data = await call<{ user?: { username?: string; email?: string } }>(
    token,
    "GET",
    "/v2/user",
  );
  return { username: data.user?.username ?? null };
}

async function paginate<T>(
  token: string,
  path: string,
  query: Query,
  pick: (data: Record<string, unknown>) => T[],
): Promise<T[]> {
  const out: T[] = [];
  let until: number | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await call<Record<string, unknown>>(token, "GET", path, {
      query: { ...query, limit: 100, until },
    });
    out.push(...pick(data));
    const next = (data.pagination as { next?: number | null } | undefined)?.next;
    if (!next) break;
    until = next;
  }
  return out;
}

export function listTeams(token: string) {
  return paginate<{ id: string; name: string }>(token, "/v2/teams", {}, (d) =>
    ((d.teams as { id: string; name?: string; slug?: string }[]) ?? []).map((t) => ({
      id: t.id,
      name: t.name ?? t.slug ?? t.id,
    })),
  );
}

export function listProjects(token: string, teamId?: string) {
  return paginate<VercelProject>(token, "/v9/projects", scope(teamId), (d) =>
    ((d.projects as { id: string; name: string }[]) ?? []).map((p) => ({
      id: p.id,
      name: p.name,
    })),
  );
}

export async function getProject(token: string, projectId: string, teamId?: string) {
  const p = await call<{ id: string; name: string }>(
    token,
    "GET",
    `/v9/projects/${enc(projectId)}`,
    { query: scope(teamId) },
  );
  return { id: p.id, name: p.name } as VercelProject;
}

export function listEnv(token: string, projectId: string, teamId?: string) {
  return paginate<VercelEnvVar>(
    token,
    `/v10/projects/${enc(projectId)}/env`,
    { ...scope(teamId), decrypt: "false" },
    (d) =>
      ((d.envs as VercelEnvVar[]) ?? []).map((e) => ({
        id: e.id,
        key: e.key,
        target: Array.isArray(e.target) ? e.target : e.target ? [String(e.target)] : [],
        gitBranch: e.gitBranch ?? null,
      })),
  );
}

export async function createEnv(
  token: string,
  projectId: string,
  teamId: string | undefined,
  v: { key: string; value: string; target: string },
): Promise<string> {
  const data = await call<{
    id?: string;
    created?: { id?: string } | { id?: string }[];
  }>(token, "POST", `/v10/projects/${enc(projectId)}/env`, {
    query: scope(teamId),
    body: { key: v.key, value: v.value, type: "encrypted", target: [v.target] },
  });
  const created = Array.isArray(data.created) ? data.created[0] : data.created;
  const id = created?.id ?? data.id;
  if (!id) throw new VercelError("validation");
  return id;
}

export async function updateEnv(
  token: string,
  projectId: string,
  teamId: string | undefined,
  envId: string,
  value: string,
) {
  await call(token, "PATCH", `/v9/projects/${enc(projectId)}/env/${enc(envId)}`, {
    query: scope(teamId),
    body: { value },
  });
}

export async function deleteEnv(
  token: string,
  projectId: string,
  teamId: string | undefined,
  envId: string,
) {
  try {
    await call(token, "DELETE", `/v9/projects/${enc(projectId)}/env/${enc(envId)}`, {
      query: scope(teamId),
    });
  } catch (err) {
    // Already gone is the desired end state.
    if (err instanceof VercelError && err.kind === "not_found") return;
    throw err;
  }
}

/** Only genuine Vercel deploy hook URLs are accepted. */
export function validateDeployHook(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.vercel.com" ||
    !url.pathname.startsWith("/v1/integrations/deploy/") ||
    url.username ||
    url.password
  )
    throw new Error("Use a deploy hook URL created in Vercel (api.vercel.com).");
  return url.toString();
}

export async function triggerDeployHook(hookUrl: string) {
  const url = new URL(validateDeployHook(hookUrl));
  // The hook URL is itself the credential: no Authorization header.
  let last = new VercelError("network");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          job?: { id?: string; state?: string };
        };
        return { jobId: data.job?.id ?? null, state: data.job?.state ?? "PENDING" };
      }
      last = new VercelError(kindFor(res.status), res.status);
      if (last.kind !== "server" && last.kind !== "rate_limited") throw last;
    } catch (err) {
      if (err instanceof VercelError && !["server", "rate_limited"].includes(err.kind))
        throw err;
      last = err instanceof VercelError ? err : new VercelError("network");
    }
    if (attempt < MAX_ATTEMPTS) await sleep(retryBase() * attempt);
  }
  throw last;
}

export async function findDeploymentSince(
  token: string,
  projectId: string,
  teamId: string | undefined,
  sinceMs: number,
) {
  const data = await call<{
    deployments?: { uid: string; url?: string; state?: string; readyState?: string; created?: number }[];
  }>(token, "GET", "/v6/deployments", {
    query: { ...scope(teamId), projectId, limit: 5 },
  });
  const found = (data.deployments ?? []).find((d) => (d.created ?? 0) >= sinceMs - 10_000);
  if (!found) return null;
  return {
    deploymentId: found.uid,
    url: found.url ? `https://${found.url}` : undefined,
    state: found.readyState ?? found.state ?? "UNKNOWN",
  };
}
