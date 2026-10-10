import { randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import {
  ApiError,
  authorizeProject,
  handler,
  isDuplicateKeyError,
  json,
  requireUserId,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { canHaveEnvironmentGrant } from "@/lib/permissions";

type Ctx = {
  params: Promise<{ projectId: string; env: string; userId: string }>;
};

/** Resolves env and target within the project the actor administers. */
async function resolve(ctx: Awaited<Ctx["params"]>, actorId: string) {
  const { project } = await authorizeProject(
    actorId,
    ctx.projectId,
    "environments:manage",
  );
  const { environments, memberships } = await collections();
  const environment = await environments.findOne({
    projectId: project._id,
    slug: ctx.env,
  });
  if (!environment) throw new ApiError(404, "Environment not found.");
  const target = await memberships.findOne({
    projectId: project._id,
    userId: ctx.userId,
  });
  if (!target) throw new ApiError(404, "Member not found.");
  if (!canHaveEnvironmentGrant(target.role))
    throw new ApiError(
      400,
      "Owners and admins already have access to every environment.",
    );
  return { project, environment, target };
}

/** Grant a member or viewer access to one environment. Idempotent. */
export const PUT = handler(async (_req: Request, { params }: Ctx) => {
  const actorId = await requireUserId();
  const ctx = await params;
  const { project, environment, target } = await resolve(ctx, actorId);

  const { environmentAccess } = await collections();
  let created = true;
  try {
    await environmentAccess.insertOne({
      _id: randomUUID(),
      projectId: project._id,
      environmentId: environment._id,
      userId: target.userId,
      grantedBy: actorId,
      createdAt: new Date(),
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    created = false;
  }

  if (created)
    await recordAudit({
      projectId: project._id,
      actorId,
      action: "environment.access_granted",
      targetType: "environment",
      targetId: environment._id,
      metadata: {
        environment: environment.slug,
        userId: target.userId,
        role: target.role,
      },
    });

  return json({ ok: true, access: "granted" });
});

/** Revoke access. Takes effect on the next request. */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const actorId = await requireUserId();
  const ctx = await params;
  const { project, environment, target } = await resolve(ctx, actorId);

  const { environmentAccess } = await collections();
  const result = await environmentAccess.deleteOne({
    environmentId: environment._id,
    userId: target.userId,
  });

  if (result.deletedCount)
    await recordAudit({
      projectId: project._id,
      actorId,
      action: "environment.access_revoked",
      targetType: "environment",
      targetId: environment._id,
      metadata: {
        environment: environment.slug,
        userId: target.userId,
        role: target.role,
      },
    });

  return json({ ok: true, access: "none" });
});
