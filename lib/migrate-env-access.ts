import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

export type EnvAccessMigrationReport = {
  membersConsidered: number;
  grantsCreated: number;
  grantsAlreadyPresent: number;
  /** Always 0: production is never granted by migration. */
  productionGrants: 0;
  applied: boolean;
};

/**
 * Before environment-level access existed, every member and viewer could use
 * every environment. To keep their day to day work going without opening
 * production, this grants each existing member and viewer explicit access to
 * every NON-production environment of their project. Production is never
 * granted: an owner or admin must do that deliberately.
 *
 * Owners and admins need nothing (implicit access). Additive and idempotent;
 * nothing is modified or deleted. Without `apply` it is a dry run.
 */
export async function migrateEnvironmentAccess(
  db: Db,
  { apply }: { apply: boolean },
): Promise<EnvAccessMigrationReport> {
  const memberships = db.collection<{
    projectId: string;
    userId: string;
    role: string;
  }>("project_memberships");
  const environments = db.collection<{
    _id: string;
    projectId: string;
    slug: string;
  }>("environments");
  const access = db.collection<{
    _id: string;
    projectId: string;
    environmentId: string;
    userId: string;
    grantedBy: string;
    createdAt: Date;
  }>("environment_access");

  if (apply) {
    await access.createIndex({ environmentId: 1, userId: 1 }, { unique: true });
    await access.createIndex({ projectId: 1, userId: 1 });
  }

  const report: EnvAccessMigrationReport = {
    membersConsidered: 0,
    grantsCreated: 0,
    grantsAlreadyPresent: 0,
    productionGrants: 0,
    applied: apply,
  };

  const envCache = new Map<string, { _id: string; slug: string }[]>();
  for await (const m of memberships.find({ role: { $in: ["member", "viewer"] } })) {
    report.membersConsidered++;
    let envs = envCache.get(m.projectId);
    if (!envs) {
      envs = await environments.find({ projectId: m.projectId }).toArray();
      envCache.set(m.projectId, envs);
    }
    for (const env of envs) {
      if (env.slug === "production") continue;
      const existing = await access.findOne({
        environmentId: env._id,
        userId: m.userId,
      });
      if (existing) {
        report.grantsAlreadyPresent++;
        continue;
      }
      if (apply)
        await access.insertOne({
          _id: randomUUID(),
          projectId: m.projectId,
          environmentId: env._id,
          userId: m.userId,
          grantedBy: "migration",
          createdAt: new Date(),
        });
      report.grantsCreated++;
    }
  }
  return report;
}
