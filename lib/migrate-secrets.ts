import "server-only";
import type { Db } from "mongodb";
import { decryptValue, encryptValue, CURRENT_VERSION } from "./crypto";

export type MigrationReport = {
  total: number;
  alreadyVersioned: number;
  /** Legacy encrypted payload with no version field, decrypted and verified. */
  stamped: number;
  /** Plaintext string values from before encryption existed. */
  encryptedFromPlaintext: number;
  /** Left untouched: could not be verified. */
  failed: { id: string; reason: string }[];
  applied: boolean;
};

/**
 * Brings records up to the versioned payload format.
 *
 * - Records that already have a version are not touched.
 * - Unversioned encrypted payloads are only stamped after they decrypt
 *   successfully under the current key (AAD = secret id).
 * - Plaintext string values are encrypted.
 * - Nothing is deleted. Records that cannot be verified are reported and left
 *   as they are. Without `apply` this is a dry run that writes nothing.
 */
export async function migrateSecrets(
  db: Db,
  { apply }: { apply: boolean },
): Promise<MigrationReport> {
  const secrets = db.collection<{ _id: string; value: unknown }>("secrets");
  const report: MigrationReport = {
    total: 0,
    alreadyVersioned: 0,
    stamped: 0,
    encryptedFromPlaintext: 0,
    failed: [],
    applied: apply,
  };

  for await (const doc of secrets.find({})) {
    report.total++;
    const value = doc.value as Record<string, unknown> | string | null;

    if (value && typeof value === "object" && "v" in value) {
      report.alreadyVersioned++;
      continue;
    }

    if (typeof value === "string") {
      if (apply)
        await secrets.updateOne(
          { _id: doc._id, value: doc.value },
          { $set: { value: encryptValue(value, doc._id) } },
        );
      report.encryptedFromPlaintext++;
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      typeof value.ciphertext === "string" &&
      typeof value.iv === "string" &&
      typeof value.tag === "string"
    ) {
      const candidate = { ...value, v: CURRENT_VERSION };
      try {
        decryptValue(candidate, doc._id);
      } catch {
        report.failed.push({ id: doc._id, reason: "failed verification" });
        continue;
      }
      if (apply)
        await secrets.updateOne(
          { _id: doc._id, value: doc.value },
          { $set: { "value.v": CURRENT_VERSION } },
        );
      report.stamped++;
      continue;
    }

    report.failed.push({ id: doc._id, reason: "unrecognized format" });
  }

  return report;
}
