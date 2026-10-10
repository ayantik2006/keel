export type EnvironmentId = string;

export type Role = "owner" | "admin" | "member" | "viewer";

export type Project = {
  id: string;
  name: string;
  /** The signed-in user's role in this project. */
  role: Role;
  /** Permissions the server granted the signed-in user. The UI only reflects these. */
  permissions: string[];
  description?: string;
  environments: string[];
  secretCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  userId: string;
  email?: string;
  name?: string;
  role: Role;
  isYou: boolean;
  createdAt: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: Exclude<Role, "owner">;
  /** Environments granted when the invitation is accepted. */
  environments?: string[];
  createdAt: string;
  expiresAt: string;
  expired: boolean;
};

export type SecretVersion = {
  versionNumber: number;
  changeType: "CREATED" | "UPDATED" | "ROLLED_BACK" | "BASELINE";
  key: string;
  isCurrent: boolean;
  restoredFromVersion: number | null;
  createdAt: string;
  changedBy: {
    userId: string;
    email: string | null;
    isYou: boolean;
    isMember: boolean;
  } | null;
};

export type ImportResponse = {
  summary: {
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    failed: number;
  };
  results: {
    key: string;
    status: "created" | "updated" | "unchanged" | "skipped" | "failed";
    error?: string;
  }[];
};

export type AuditEvent = {
  id: string;
  at: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, string | number | boolean | null>;
  actor: {
    userId: string;
    email: string | null;
    isYou: boolean;
    isMember: boolean;
  };
};

export type VercelStatus =
  | { connected: false }
  | {
      connected: true;
      status: "connected" | "active" | "attention";
      vercelProjectId: string | null;
      vercelProjectName: string | null;
      teamId: string | null;
      mappings: Record<string, string>;
      autoRedeploy: boolean;
      hookConfigured: boolean;
      conflictPolicy: "skip" | "overwrite";
      lastSyncAt: string | null;
      lastSyncStatus: "success" | "partial" | "failed" | null;
      lastError: string | null;
      lastRun: {
        created: number;
        updated: number;
        deleted: number;
        unchanged: number;
        conflicts: string[];
        failed: string[];
      } | null;
      lastDeployment: {
        state: string;
        url: string | null;
        deploymentId: string | null;
        triggeredAt: string;
      } | null;
      syncing: boolean;
      pending: number;
      environments: string[];
    };

export type VercelSyncSummary = {
  status: "success" | "partial" | "failed";
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  conflicts: string[];
  failed: string[];
  error?: string;
  deployment?: "triggered" | "skipped" | "none";
  deploymentReason?: string;
};

export type SecurityOverview = {
  encryption: {
    algorithm: string;
    secretsEncryptedAtRest: boolean;
    keyConfigured: boolean;
    currentKeyVersion: number;
    keyStorage: string;
    records: { total: number; onCurrentKeyVersion: number; other: number };
    keyRotation: boolean;
    externalKms: boolean;
  };
  authentication: {
    provider: string;
    note: string;
    cliAccessTokenMinutes: number;
    cliRefreshTokenDays: number;
  };
  access: {
    members: Record<Role, number>;
    pendingInvitations: number;
    environments: {
      slug: string;
      membersAndViewersWithAccess: number;
      membersAndViewersTotal: number;
    }[];
  };
  integrations: {
    vercel: { status: string; project: string | null } | null;
  };
  auditLog: { events: number; retention: string };
};

export type CliSession = {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

export type EnvironmentAccessState = "implicit" | "granted" | "none";

export type EnvironmentAccessMatrix = {
  environments: string[];
  members: {
    userId: string;
    email?: string;
    role: Role;
    isYou: boolean;
    secretPermissions: string[];
    access: Record<string, EnvironmentAccessState>;
  }[];
};

export const hasPermission = (project: Project, permission: string) =>
  project.permissions.includes(permission);

/** Secret metadata. The value is only fetched on demand. */
export type Secret = {
  id: string;
  key: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export const ENVIRONMENTS: { id: EnvironmentId; label: string }[] = [
  { id: "development", label: "Development" },
  { id: "staging", label: "Staging" },
  { id: "production", label: "Production" },
];

export function envLabel(id: EnvironmentId) {
  return ENVIRONMENTS.find((e) => e.id === id)?.label ?? id;
}

export const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});
