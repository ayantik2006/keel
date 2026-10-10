import "server-only";
import { randomUUID } from "node:crypto";
import { collections, type SecretDoc, type SecretVersionDoc } from "./db";
import { encryptValue } from "./crypto";
import { ApiError, isDuplicateKeyError } from "./api";

/**
 * Secret version history.
 *
 * MongoDB here is a standalone server, so there are no multi-document
 * transactions. Consistency comes from three rules instead:
 *
 * 1. The secret document carries its own `version` and `lastChange`. A change
 *    is one compare-and-set on that single document (`version` must equal the
 *    value the writer read), so exactly one of any set of concurrent writers
 *    produces version N+1, and nobody silently overwrites a newer value.
 * 2. Version records are unique on (secretId, versionNumber), so a version
 *    number can never be duplicated.
 * 3. Version records are journaled idempotently from the secret document.
 *    Before a value is replaced, the value being replaced is recorded; after a
 *    change, the new value is recorded. If a process dies between the update
 *    and the journal write, the next reader or writer repairs the missing
 *    record from the secret document, which still holds that exact state.
 *
 * Existing secrets have no `version`. They are treated as version 1 and their
 * current value is recorded as a BASELINE version, with no actor, the first
 * time it is needed. No earlier history is invented.
 */

const MAX_ATTEMPTS = 5;

export function currentVersionOf(secret: SecretDoc): number {
  return secret.version ?? 1;
}

/** Builds the version record for the secret's CURRENT state. */
export function versionRecordFor(secret: SecretDoc): SecretVersionDoc {
  const change = secret.lastChange;
  return {
    _id: randomUUID(),
    secretId: secret._id,
    projectId: secret.projectId,
    environmentId: secret.environmentId,
    versionNumber: currentVersionOf(secret),
    key: secret.key,
    value: secret.value,
    changeType: change ? change.type : "BASELINE",
    actorId: change ? change.actorId : null,
    ...(change?.restoredFromVersion !== undefined
      ? { restoredFromVersion: change.restoredFromVersion }
      : {}),
    createdAt: change ? change.at : secret.updatedAt,
  };
}

/** Idempotently persists the record for the secret's current version. */
export async function recordCurrentVersion(secret: SecretDoc): Promise<void> {
  const { secretVersions } = await collections();
  try {
    await secretVersions.insertOne(versionRecordFor(secret));
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
}

/** Creates a secret at version 1. */
export async function createSecretWithVersion(input: {
  projectId: string;
  environmentId: string;
  key: string;
  plaintext: string;
  actorId: string;
}): Promise<SecretDoc> {
  const { secrets } = await collections();
  const id = randomUUID();
  const now = new Date();
  const doc: SecretDoc = {
    _id: id,
    projectId: input.projectId,
    environmentId: input.environmentId,
    key: input.key,
    value: encryptValue(input.plaintext, id),
    version: 1,
    lastChange: { type: "CREATED", actorId: input.actorId, at: now },
    createdAt: now,
    updatedAt: now,
  };
  await secrets.insertOne(doc);
  await recordCurrentVersion(doc);
  return doc;
}

export class VersionConflictError extends ApiError {
  constructor() {
    super(
      409,
      "This secret was changed by someone else. Reload and try again.",
    );
  }
}

/**
 * Replaces the secret's value (and optionally key) as a new version.
 *
 * With `expectedVersion`, the write only succeeds if the secret is still at
 * that version, otherwise 409. Without it, the write is retried against the
 * latest version; the value it replaces is always preserved as a version, so
 * nothing is lost.
 */
export async function writeNewVersion(input: {
  secretId: string;
  projectId: string;
  environmentId: string;
  plaintext: string;
  key?: string;
  actorId: string;
  changeType: "UPDATED" | "ROLLED_BACK";
  restoredFromVersion?: number;
  expectedVersion?: number;
}): Promise<SecretDoc> {
  const { secrets, projects } = await collections();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const secret = await secrets.findOne({
      _id: input.secretId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    });
    if (!secret) throw new ApiError(404, "Secret not found.");

    const current = currentVersionOf(secret);
    if (input.expectedVersion !== undefined && input.expectedVersion !== current)
      throw new VersionConflictError();

    // Preserve the value that is about to be replaced.
    await recordCurrentVersion(secret);

    const now = new Date();
    const updated = await secrets.findOneAndUpdate(
      {
        _id: secret._id,
        projectId: input.projectId,
        environmentId: input.environmentId,
        version:
          secret.version === undefined ? { $exists: false } : secret.version,
      },
      {
        $set: {
          value: encryptValue(input.plaintext, secret._id),
          version: current + 1,
          lastChange: {
            type: input.changeType,
            actorId: input.actorId,
            at: now,
            ...(input.restoredFromVersion !== undefined
              ? { restoredFromVersion: input.restoredFromVersion }
              : {}),
          },
          updatedAt: now,
          ...(input.key !== undefined ? { key: input.key } : {}),
        },
      },
      { returnDocument: "after" },
    );

    if (updated) {
      await recordCurrentVersion(updated);
      await projects.updateOne(
        { _id: input.projectId },
        { $set: { updatedAt: now } },
      );
      return updated;
    }
    // Lost the compare-and-set to a concurrent writer.
    if (input.expectedVersion !== undefined) throw new VersionConflictError();
  }
  throw new VersionConflictError();
}
