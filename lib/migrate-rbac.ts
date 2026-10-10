import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

export type RbacMigrationReport = {
  projects: number;
  alreadyHadOwnerMembership: number;
  ownerMembershipsCreated: number;
  skippedNoOwner: string[];
  applied: boolean;
};

/**
 * Gives each pre-RBAC project exactly one owner membership, for the user the
 * project already records as `ownerId`. Nobody else is granted anything, and
 * nothing is modified or deleted. Safe to re-run. Without `apply` it is a dry
 * run that writes nothing.
 */
export async function migrateRbac(
  db: Db,
  { apply }: { apply: boolean },
): Promise<RbacMigrationReport> {
  const projects = db.collection<{ _id: string; ownerId?: string }>("projects");
  const memberships = db.collection<{
    _id: string;
    projectId: string;
    userId: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  }>("project_memberships");

  if (apply)
    await memberships.createIndex({ projectId: 1, userId: 1 }, { unique: true });

  const report: RbacMigrationReport = {
    projects: 0,
    alreadyHadOwnerMembership: 0,
    ownerMembershipsCreated: 0,
    skippedNoOwner: [],
    applied: apply,
  };

  for await (const project of projects.find({})) {
    report.projects++;
    if (!project.ownerId) {
      report.skippedNoOwner.push(project._id);
      continue;
    }
    const existing = await memberships.findOne({
      projectId: project._id,
      userId: project.ownerId,
    });
    if (existing) {
      report.alreadyHadOwnerMembership++;
      continue;
    }
    if (apply) {
      const now = new Date();
      await memberships.insertOne({
        _id: randomUUID(),
        projectId: project._id,
        userId: project.ownerId,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    }
    report.ownerMembershipsCreated++;
  }

  return report;
}
