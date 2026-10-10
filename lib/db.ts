import "server-only";
import { MongoClient, type Db } from "mongodb";
import type { EncryptedPayload } from "./crypto";
import type { Role } from "./permissions";

export type ProjectDoc = {
  _id: string;
  ownerId: string;
  name: string;
  nameLower: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type EnvironmentDoc = {
  _id: string;
  projectId: string;
  slug: string;
  name: string;
  createdAt: Date;
};

export type SecretDoc = {
  _id: string;
  projectId: string;
  environmentId: string;
  key: string;
  /** Versioned AES-256-GCM payload. The encryption key never lives in the database. */
  value: EncryptedPayload;
  /**
   * Current version number. Absent on secrets created before version history
   * existed; those are treated as version 1 (see lib/secret-versions.ts).
   */
  version?: number;
  /** What produced the current version. Lets a missing version record be repaired. */
  lastChange?: {
    type: "CREATED" | "UPDATED" | "ROLLED_BACK";
    actorId: string;
    at: Date;
    restoredFromVersion?: number;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type SecretVersionDoc = {
  _id: string;
  secretId: string;
  projectId: string;
  environmentId: string;
  versionNumber: number;
  /** Key name at the time of the version. */
  key: string;
  /** Encrypted with the same service and key version metadata as the secret. */
  value: EncryptedPayload;
  /** BASELINE marks the value a secret already had before history existed. */
  changeType: "CREATED" | "UPDATED" | "ROLLED_BACK" | "BASELINE";
  /** Null for BASELINE: the actor was never recorded. */
  actorId: string | null;
  restoredFromVersion?: number;
  createdAt: Date;
};

export type MembershipDoc = {
  _id: string;
  projectId: string;
  /** Auth provider (Clerk) user id. */
  userId: string;
  role: Role;
  /** Email snapshot for display. Not used for authorization. */
  email?: string;
  /** Display name snapshot from the auth provider, when it has one. */
  name?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type InvitationDoc = {
  _id: string;
  projectId: string;
  inviterId: string;
  /** Lowercased. */
  email: string;
  role: Exclude<Role, "owner">;
  /**
   * Environments to grant once the invitation is accepted. Only set for roles
   * that need grants (member and viewer).
   */
  environmentIds?: string[];
  /** SHA-256 of the token. The token itself is never stored. */
  tokenHash: string;
  expiresAt: Date;
  status: "pending" | "accepted" | "revoked";
  createdAt: Date;
  acceptedBy?: string;
  acceptedAt?: Date;
  revokedBy?: string;
  revokedAt?: Date;
};

export type EnvironmentAccessDoc = {
  _id: string;
  projectId: string;
  environmentId: string;
  /** Auth provider (Clerk) user id. Must also be a member of the project. */
  userId: string;
  grantedBy: string;
  createdAt: Date;
};

export type CliDeviceRequestDoc = {
  _id: string;
  /** SHA-256 of the device code. The device code itself is never stored. */
  deviceCodeHash: string;
  /** Short code the user confirms in the browser. */
  userCode: string;
  status: "pending" | "approved" | "denied" | "consumed";
  userId?: string;
  email?: string;
  deviceName: string;
  createdAt: Date;
  expiresAt: Date;
};

export type CliSessionDoc = {
  _id: string;
  userId: string;
  email?: string;
  /** SHA-256 hashes. Tokens are never stored. */
  accessHash: string;
  accessExpiresAt: Date;
  refreshHash: string;
  /** The previous refresh token. Presenting it again revokes the session. */
  prevRefreshHash?: string;
  refreshExpiresAt: Date;
  deviceName: string;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt?: Date;
};

export type VercelTarget = "development" | "preview" | "production";

export type IntegrationDoc = {
  _id: string;
  projectId: string;
  provider: "vercel";
  /** connected: token valid, no project yet. active: linked. attention: needs the user. */
  status: "connected" | "active" | "attention";
  /** Encrypted with the secrets encryption service. AAD is the integration id. */
  tokenEnc: EncryptedPayload;
  /** Encrypted deploy hook URL (it contains a secret). AAD is `${id}:hook`. */
  hookEnc?: EncryptedPayload;
  teamId?: string;
  vercelProjectId?: string;
  vercelProjectName?: string;
  /** Keel environment slug to Vercel target. */
  mappings: Record<string, VercelTarget>;
  autoRedeploy: boolean;
  /** skip: leave variables Keel did not create. overwrite: adopt them. */
  conflictPolicy: "skip" | "overwrite";
  lastSyncAt?: Date;
  lastSyncStatus?: "success" | "partial" | "failed";
  /** Fixed, sanitized text. Never raw API output. */
  lastError?: string;
  lastRun?: {
    runId: string;
    at: Date;
    created: number;
    updated: number;
    deleted: number;
    unchanged: number;
    conflicts: string[];
    failed: string[];
  };
  lastDeployment?: {
    runId: string;
    jobId?: string;
    deploymentId?: string;
    url?: string;
    state: string;
    triggeredAt: Date;
  };
  lastDeployRunId?: string;
  pendingEnvs?: string[];
  pendingActorId?: string;
  dirty?: boolean;
  lockUntil?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Which Vercel variable Keel created for which secret. Ownership record. */
export type IntegrationVarDoc = {
  _id: string;
  integrationId: string;
  secretId: string;
  environmentSlug: string;
  key: string;
  target: VercelTarget;
  vercelEnvId: string;
  syncedVersion: number;
  syncedAt: Date;
};

export type AuditLogDoc = {
  _id: string;
  projectId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, string | number | boolean | null>;
  at: Date;
};

const globalForMongo = globalThis as unknown as {
  mongoDb?: Promise<Db>;
  mongoIndexes?: { signature: string; ready: Promise<void> };
};

type IndexSpec = {
  collection: string;
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean; partialFilterExpression?: Record<string, unknown> };
};

const INDEXES: IndexSpec[] = [
  { collection: "projects", keys: { ownerId: 1, nameLower: 1 }, options: { unique: true } },
  { collection: "environments", keys: { projectId: 1, slug: 1 }, options: { unique: true } },
  { collection: "secrets", keys: { environmentId: 1, key: 1 }, options: { unique: true } },
  { collection: "secrets", keys: { projectId: 1 } },
  { collection: "project_memberships", keys: { projectId: 1, userId: 1 }, options: { unique: true } },
  { collection: "project_memberships", keys: { userId: 1 } },
  { collection: "project_invitations", keys: { tokenHash: 1 }, options: { unique: true } },
  {
    collection: "project_invitations",
    keys: { projectId: 1, email: 1 },
    options: { unique: true, partialFilterExpression: { status: "pending" } },
  },
  { collection: "audit_logs", keys: { projectId: 1, at: -1 } },
  { collection: "environment_access", keys: { environmentId: 1, userId: 1 }, options: { unique: true } },
  { collection: "environment_access", keys: { projectId: 1, userId: 1 } },
  { collection: "secret_versions", keys: { secretId: 1, versionNumber: 1 }, options: { unique: true } },
  { collection: "secret_versions", keys: { projectId: 1 } },
  { collection: "cli_device_requests", keys: { deviceCodeHash: 1 }, options: { unique: true } },
  { collection: "cli_device_requests", keys: { userCode: 1 }, options: { unique: true } },
  { collection: "cli_sessions", keys: { accessHash: 1 }, options: { unique: true } },
  { collection: "cli_sessions", keys: { refreshHash: 1 }, options: { unique: true } },
  { collection: "cli_sessions", keys: { userId: 1 } },
  { collection: "integrations", keys: { projectId: 1, provider: 1 }, options: { unique: true } },
  { collection: "integration_vars", keys: { integrationId: 1, secretId: 1 }, options: { unique: true } },
];

/**
 * Computed from the index definitions themselves, so any change to INDEXES is
 * noticed even when the connection survives a dev hot reload.
 */
const INDEX_SIGNATURE = JSON.stringify(INDEXES);

/**
 * Removes exact duplicate version records (same secret, same version number,
 * same encrypted payload) so the unique index can be built. Such copies came
 * from idempotent history repair running before the index existed. Records
 * that differ are never touched.
 */
async function removeExactDuplicateVersions(db: Db) {
  const versions = db.collection<SecretVersionDoc>("secret_versions");
  const groups = await versions
    .aggregate<{ ids: string[]; payloads: string[] }>([
      {
        $group: {
          _id: { s: "$secretId", n: "$versionNumber" },
          ids: { $push: "$_id" },
          payloads: {
            $push: {
              $concat: ["$value.ciphertext", ":", "$value.iv", ":", "$value.tag"],
            },
          },
          c: { $sum: 1 },
        },
      },
      { $match: { c: { $gt: 1 } } },
    ])
    .toArray();

  for (const g of groups) {
    const keep = g.payloads[0];
    const drop = g.ids.filter((_, i) => i > 0 && g.payloads[i] === keep);
    if (drop.length) await versions.deleteMany({ _id: { $in: drop } });
  }
}

export async function ensureIndexes(db: Db) {
  await removeExactDuplicateVersions(db);
  const results = await Promise.allSettled(
    INDEXES.map((i) =>
      db.collection(i.collection).createIndex(i.keys, i.options ?? {}),
    ),
  );
  // A failed index (for example existing conflicting data) must be loud but
  // must not take the whole app down. Only names are logged, never data.
  results.forEach((r, i) => {
    if (r.status === "rejected")
      console.error(
        "Index creation failed:",
        INDEXES[i].collection,
        JSON.stringify(INDEXES[i].keys),
      );
  });
}

async function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  const client = new MongoClient(uri);
  await client.connect();
  return client.db();
}

/** Shared connection, reused across hot reloads in development. */
export async function getDb(): Promise<Db> {
  if (!globalForMongo.mongoDb) {
    globalForMongo.mongoDb = connect().catch((err) => {
      globalForMongo.mongoDb = undefined;
      throw err;
    });
  }
  const db = await globalForMongo.mongoDb;

  // Indexes are (re)built whenever their definitions change, not only when
  // the process first connects.
  if (globalForMongo.mongoIndexes?.signature !== INDEX_SIGNATURE) {
    const ready = ensureIndexes(db).catch((err) => {
      globalForMongo.mongoIndexes = undefined;
      throw err;
    });
    globalForMongo.mongoIndexes = { signature: INDEX_SIGNATURE, ready };
  }
  await globalForMongo.mongoIndexes.ready;
  return db;
}

export async function collections() {
  const db = await getDb();
  return {
    projects: db.collection<ProjectDoc>("projects"),
    environments: db.collection<EnvironmentDoc>("environments"),
    secrets: db.collection<SecretDoc>("secrets"),
    memberships: db.collection<MembershipDoc>("project_memberships"),
    invitations: db.collection<InvitationDoc>("project_invitations"),
    auditLogs: db.collection<AuditLogDoc>("audit_logs"),
    environmentAccess: db.collection<EnvironmentAccessDoc>("environment_access"),
    secretVersions: db.collection<SecretVersionDoc>("secret_versions"),
    cliDevices: db.collection<CliDeviceRequestDoc>("cli_device_requests"),
    cliSessions: db.collection<CliSessionDoc>("cli_sessions"),
    integrations: db.collection<IntegrationDoc>("integrations"),
    integrationVars: db.collection<IntegrationVarDoc>("integration_vars"),
  };
}
