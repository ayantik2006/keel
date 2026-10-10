import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

export type VersionMigrationReport = {
  secrets: number;
  alreadyVersioned: number;
  baselinesCreated: number;
  applied: boolean;
};

/**
 * Brings secrets that predate version history into the versioned model.
 *
 * Each such secret becomes version 1, and its CURRENT value is recorded once as
 * a BASELINE version with no actor (the actor was never recorded) and the
 * secret's last updated time. No earlier history is invented: there is no way
 * to know what values it held before.
 *
 * Optional: the application does the same lazily when a secret is first
 * viewed or changed. Additive and idempotent; secret values are not modified.
 * Without `apply` this is a dry run.
 */
export async function migrateSecretVersions(
  db: Db,
  { apply }: { apply: boolean },
): Promise<VersionMigrationReport> {
  const secrets = db.collection<{
    _id: string;
    projectId: string;
    environmentId: string;
    key: string;
    value: unknown;
    version?: number;
    updatedAt: Date;
  }>("secrets");
  const versions = db.collection<{ _id: string; secretId: string; versionNumber: number }>(
    "secret_versions",
  );

  if (apply) {
    await versions.createIndex({ secretId: 1, versionNumber: 1 }, { unique: true });
  }

  const report: VersionMigrationReport = {
    secrets: 0,
    alreadyVersioned: 0,
    baselinesCreated: 0,
    applied: apply,
  };

  for await (const secret of secrets.find({})) {
    report.secrets++;
    if (secret.version !== undefined) {
      report.alreadyVersioned++;
      continue;
    }
    if (apply) {
      try {
        await versions.insertOne({
          _id: randomUUID(),
          secretId: secret._id,
          projectId: secret.projectId,
          environmentId: secret.environmentId,
          versionNumber: 1,
          key: secret.key,
          value: secret.value,
          changeType: "BASELINE",
          actorId: null,
          createdAt: secret.updatedAt,
        } as never);
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
      await secrets.updateOne(
        { _id: secret._id, version: { $exists: false } },
        { $set: { version: 1 } },
      );
    }
    report.baselinesCreated++;
  }
  return report;
}
