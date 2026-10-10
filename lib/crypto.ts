import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for secret values: AES-256-GCM via node:crypto.
 *
 * Stored payload (all binary fields base64):
 *   { v: key version, ciphertext, iv: 12 byte nonce, tag: 16 byte GCM tag }
 *
 * Keys come from the server environment only and are never stored in the
 * database. Key version N maps to an environment variable:
 *   v1 -> SECRETS_ENCRYPTION_KEY
 *   vN -> SECRETS_ENCRYPTION_KEY_V<N>
 * New writes always use CURRENT_VERSION. Rotation tooling (re-encrypting
 * existing records under a new version) is not implemented.
 */

export const CURRENT_VERSION = 1;

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type EncryptedPayload = {
  v: number;
  ciphertext: string;
  iv: string;
  tag: string;
};

/** Thrown for any decryption failure. The message never contains data. */
export class DecryptionError extends Error {
  constructor(message = "Secret could not be decrypted.") {
    super(message);
    this.name = "DecryptionError";
  }
}

export class EncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionConfigError";
  }
}

function envNameFor(version: number) {
  return version === 1
    ? "SECRETS_ENCRYPTION_KEY"
    : `SECRETS_ENCRYPTION_KEY_V${version}`;
}

/** Parses and validates a base64 encoded 32 byte key. Never echoes the value. */
function parseKey(raw: string | undefined, name: string): Buffer {
  if (!raw) throw new EncryptionConfigError(`${name} is not set.`);
  // Strict canonical base64 for exactly 32 bytes (43 chars + one "=").
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw))
    throw new EncryptionConfigError(
      `${name} must be base64 encoding of exactly 32 bytes.`,
    );
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES)
    throw new EncryptionConfigError(
      `${name} must be base64 encoding of exactly 32 bytes.`,
    );
  if (key.every((b) => b === key[0]))
    throw new EncryptionConfigError(`${name} is not a random key.`);
  return key;
}

function keyForVersion(version: number): Buffer {
  const name = envNameFor(version);
  return parseKey(process.env[name], name);
}

/** Throws if the current key is missing or malformed. Called at server start. */
export function assertEncryptionConfig() {
  keyForVersion(CURRENT_VERSION);
}

/**
 * Encrypts with a fresh random 96 bit nonce. The secret id is bound as
 * additional authenticated data, so a payload copied to another record fails
 * authentication.
 */
export function encryptValue(plaintext: string, secretId: string): EncryptedPayload {
  const key = keyForVersion(CURRENT_VERSION);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(secretId));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    v: CURRENT_VERSION,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** Fails closed: any malformed, tampered or unsupported payload throws. */
export function decryptValue(payload: unknown, secretId: string): string {
  if (typeof payload !== "object" || payload === null) throw new DecryptionError();
  const p = payload as Partial<EncryptedPayload>;
  if (
    typeof p.v !== "number" ||
    !Number.isInteger(p.v) ||
    p.v < 1 ||
    typeof p.ciphertext !== "string" ||
    typeof p.iv !== "string" ||
    typeof p.tag !== "string"
  )
    throw new DecryptionError("Secret has no supported encryption format.");

  try {
    const iv = Buffer.from(p.iv, "base64");
    const tag = Buffer.from(p.tag, "base64");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES)
      throw new DecryptionError();

    const decipher = createDecipheriv("aes-256-gcm", keyForVersion(p.v), iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(secretId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(p.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    // Missing keys are a configuration problem and stay distinguishable;
    // everything else (bad tag, tampering, wrong key) is one generic failure.
    if (err instanceof EncryptionConfigError) throw err;
    throw new DecryptionError();
  }
}
