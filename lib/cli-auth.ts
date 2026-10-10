import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { collections, type CliSessionDoc } from "./db";

/**
 * CLI credentials: a device-authorization flow that ends in a short-lived
 * access token (1 hour) and a rotating refresh token (30 days). Both are
 * random, prefixed for secret scanners, and stored only as SHA-256 hashes.
 * Sessions can be revoked at any time; revoked or expired tokens stop working
 * on the next request.
 */

export const DEVICE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const POLL_INTERVAL_SECONDS = 3;

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function newDeviceCode() {
  return randomBytes(32).toString("base64url");
}

export function newUserCode() {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += USER_CODE_ALPHABET[b % USER_CODE_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeUserCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 8) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function issueTokens() {
  return {
    accessToken: `keel_at_${randomBytes(32).toString("base64url")}`,
    refreshToken: `keel_rt_${randomBytes(32).toString("base64url")}`,
  };
}

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  email?: string;
};

function describe(
  tokens: ReturnType<typeof issueTokens>,
  access: Date,
  refresh: Date,
  email?: string,
): IssuedSession {
  return {
    ...tokens,
    accessExpiresAt: access.toISOString(),
    refreshExpiresAt: refresh.toISOString(),
    ...(email ? { email } : {}),
  };
}

export async function createSession(input: {
  userId: string;
  email?: string;
  deviceName: string;
}): Promise<IssuedSession> {
  const { cliSessions } = await collections();
  const tokens = issueTokens();
  const now = new Date();
  const access = new Date(now.getTime() + ACCESS_TTL_MS);
  const refresh = new Date(now.getTime() + REFRESH_TTL_MS);
  await cliSessions.insertOne({
    _id: randomUUID(),
    userId: input.userId,
    ...(input.email ? { email: input.email } : {}),
    accessHash: sha256(tokens.accessToken),
    accessExpiresAt: access,
    refreshHash: sha256(tokens.refreshToken),
    refreshExpiresAt: refresh,
    deviceName: input.deviceName,
    createdAt: now,
    lastUsedAt: now,
  });
  return describe(tokens, access, refresh, input.email);
}

/**
 * Rotates the refresh token. A refresh token can be used once; presenting an
 * already-rotated token is treated as theft and revokes the whole session.
 */
export async function refreshSession(
  refreshToken: string,
): Promise<IssuedSession | null> {
  const { cliSessions } = await collections();
  const hash = sha256(refreshToken);
  const now = new Date();

  const reused = await cliSessions.findOne({ prevRefreshHash: hash });
  if (reused) {
    await cliSessions.updateOne(
      { _id: reused._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: now } },
    );
    return null;
  }

  const tokens = issueTokens();
  const access = new Date(now.getTime() + ACCESS_TTL_MS);
  const updated = await cliSessions.findOneAndUpdate(
    {
      refreshHash: hash,
      revokedAt: { $exists: false },
      refreshExpiresAt: { $gt: now },
    },
    {
      $set: {
        accessHash: sha256(tokens.accessToken),
        accessExpiresAt: access,
        refreshHash: sha256(tokens.refreshToken),
        prevRefreshHash: hash,
        lastUsedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) return null;
  return describe(tokens, access, updated.refreshExpiresAt, updated.email);
}

export type VerifiedCliSession = Pick<CliSessionDoc, "_id" | "userId">;

/** Returns the session for a valid, unexpired, unrevoked access token. */
export async function verifyAccessToken(
  token: string,
): Promise<VerifiedCliSession | null> {
  if (!token.startsWith("keel_at_")) return null;
  const { cliSessions } = await collections();
  const session = await cliSessions.findOneAndUpdate(
    {
      accessHash: sha256(token),
      revokedAt: { $exists: false },
      accessExpiresAt: { $gt: new Date() },
    },
    { $set: { lastUsedAt: new Date() } },
    { projection: { _id: 1, userId: 1 } },
  );
  return session ? { _id: session._id, userId: session.userId } : null;
}

export async function revokeSession(sessionId: string) {
  const { cliSessions } = await collections();
  await cliSessions.updateOne(
    { _id: sessionId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const { cliSessions } = await collections();
  const res = await cliSessions.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  return res.modifiedCount;
}
