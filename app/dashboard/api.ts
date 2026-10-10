import type {
  EnvironmentAccessMatrix,
  ImportResponse,
  AuditEvent,
  Invitation,
  Member,
  Project,
  Role,
  CliSession,
  SecurityOverview,
  Secret,
  SecretVersion,
  VercelStatus,
  VercelSyncSummary,
} from "./types";

/** Error from the API. `status` lets the UI show an access-denied state. */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      data?.error ??
        (res.status === 401
          ? "Your session has expired. Please sign in again."
          : "Something went wrong. Please try again."),
    );
  }
  return data as T;
}

const secretsUrl = (projectId: string, env: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(env)}/secrets`;

export const api = {
  listProjects: () =>
    request<{ projects: Project[] }>("/api/projects").then((r) => r.projects),

  createProject: (body: {
    name: string;
    description: string;
    environments: string[];
  }) =>
    request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.project),

  updateProject: (id: string, body: { name: string; description: string }) =>
    request<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.project),

  deleteProject: (id: string) =>
    request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  listMembers: (projectId: string) =>
    request<{ members: Member[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/members`,
    ).then((r) => r.members),

  updateMemberRole: (projectId: string, userId: string, role: Role) =>
    request<{ member: { userId: string; role: Role } }>(
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    ),

  removeMember: (projectId: string, userId: string) =>
    request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    ),

  listInvitations: (projectId: string) =>
    request<{ invitations: Invitation[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/invitations`,
    ).then((r) => r.invitations),

  createInvitation: (projectId: string, body: { email: string; role: Role; environments?: string[] }) =>
    request<{ invitation: Invitation; devAcceptUrl?: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/invitations`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  revokeInvitation: (projectId: string, invitationId: string) =>
    request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(projectId)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: "DELETE" },
    ),

  acceptInvitation: (token: string) =>
    request<{ projectId: string; role: Role }>("/api/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  getEnvironmentAccess: (projectId: string) =>
    request<EnvironmentAccessMatrix>(
      `/api/projects/${encodeURIComponent(projectId)}/environment-access`,
    ),

  setEnvironmentAccess: (
    projectId: string,
    env: string,
    userId: string,
    granted: boolean,
  ) =>
    request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(env)}/access/${encodeURIComponent(userId)}`,
      { method: granted ? "PUT" : "DELETE" },
    ),

  listSecrets: (projectId: string, env: string) =>
    request<{ secrets: Secret[] }>(secretsUrl(projectId, env)).then(
      (r) => r.secrets,
    ),

  getSecretValue: (projectId: string, env: string, id: string) =>
    request<{ secret: { value: string } }>(
      `${secretsUrl(projectId, env)}/${encodeURIComponent(id)}`,
    ).then((r) => r.secret.value),

  createSecret: (
    projectId: string,
    env: string,
    body: { key: string; value: string },
  ) =>
    request<{ secret: Secret }>(secretsUrl(projectId, env), {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.secret),

  importSecrets: (
    projectId: string,
    env: string,
    entries: { key: string; value: string; overwrite: boolean }[],
  ) =>
    request<ImportResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(env)}/import`,
      { method: "POST", body: JSON.stringify({ entries }) },
    ),

  /** The dotenv text, generated by the server for an authorized caller. */
  exportDotenv: async (projectId: string, env: string) => {
    let res: Response;
    try {
      res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(env)}/export?format=dotenv`,
      );
    } catch {
      throw new Error("Could not reach the server. Check your connection.");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiRequestError(
        res.status,
        data?.error ?? "Something went wrong. Please try again.",
      );
    }
    return res.text();
  },

  vercelStatus: (projectId: string) =>
    request<VercelStatus>(
      `/api/projects/${encodeURIComponent(projectId)}/integrations/vercel`,
    ),

  vercelConnect: (projectId: string, body: { token: string; teamId?: string }) =>
    request<VercelStatus>(
      `/api/projects/${encodeURIComponent(projectId)}/integrations/vercel`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  vercelOptions: (projectId: string, teamId?: string) =>
    request<{ teams: { id: string; name: string }[]; projects: { id: string; name: string }[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/integrations/vercel/options${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`,
    ),

  vercelConfigure: (
    projectId: string,
    body: {
      vercelProjectId: string;
      teamId?: string;
      mappings: Record<string, string>;
      autoRedeploy: boolean;
      conflictPolicy: "skip" | "overwrite";
      deployHookUrl?: string | null;
    },
  ) =>
    request<VercelStatus>(
      `/api/projects/${encodeURIComponent(projectId)}/integrations/vercel`,
      { method: "PUT", body: JSON.stringify(body) },
    ),

  vercelSync: (projectId: string, redeploy: boolean) =>
    request<{ summary: VercelSyncSummary }>(
      `/api/projects/${encodeURIComponent(projectId)}/integrations/vercel/sync`,
      { method: "POST", body: JSON.stringify({ redeploy }) },
    ),

  vercelDisconnect: (projectId: string) =>
    request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(projectId)}/integrations/vercel`,
      { method: "DELETE" },
    ),

  security: (projectId: string) =>
    request<SecurityOverview>(
      `/api/projects/${encodeURIComponent(projectId)}/security`,
    ),

  listCliSessions: () =>
    request<{ sessions: CliSession[] }>("/api/cli/sessions").then((r) => r.sessions),

  revokeCliSession: (id: string) =>
    request<{ ok: true }>(`/api/cli/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  revokeAllCliSessions: () =>
    request<{ revoked: number }>("/api/cli/sessions", { method: "DELETE" }),

  listAudit: (
    projectId: string,
    opts: {
      action?: string;
      category?: string;
      actor?: string;
      from?: string;
      to?: string;
      cursor?: string;
    } = {},
  ) => {
    const q = new URLSearchParams();
    for (const k of ["action", "category", "actor", "from", "to", "cursor"] as const)
      if (opts[k]) q.set(k, opts[k] as string);
    q.set("limit", "25");
    return request<{ events: AuditEvent[]; nextCursor: string | null }>(
      `/api/projects/${encodeURIComponent(projectId)}/audit?${q}`,
    );
  },

  listVersions: (projectId: string, env: string, id: string) =>
    request<{ currentVersion: number; versions: SecretVersion[] }>(
      `${secretsUrl(projectId, env)}/${encodeURIComponent(id)}/versions`,
    ),

  revealVersion: (projectId: string, env: string, id: string, n: number) =>
    request<{ version: { value: string } }>(
      `${secretsUrl(projectId, env)}/${encodeURIComponent(id)}/versions/${n}`,
    ).then((r) => r.version.value),

  restoreVersion: (
    projectId: string,
    env: string,
    id: string,
    n: number,
    expectedVersion?: number,
  ) =>
    request<{ secret: Secret }>(
      `${secretsUrl(projectId, env)}/${encodeURIComponent(id)}/versions/${n}/restore`,
      { method: "POST", body: JSON.stringify({ expectedVersion }) },
    ).then((r) => r.secret),

  updateSecret: (
    projectId: string,
    env: string,
    id: string,
    body: { key: string; value: string; expectedVersion?: number },
  ) =>
    request<{ secret: Secret }>(
      `${secretsUrl(projectId, env)}/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ).then((r) => r.secret),

  deleteSecret: (projectId: string, env: string, id: string) =>
    request<{ ok: true }>(
      `${secretsUrl(projectId, env)}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong.";
}
