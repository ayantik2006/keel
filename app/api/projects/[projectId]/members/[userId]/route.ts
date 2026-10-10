import { collections } from "@/lib/db";
import {
  ApiError,
  authorizeProject,
  handler,
  json,
  parseAssignableRole,
  readBody,
  requireUserId,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ projectId: string; userId: string }> };

/** Change a member's role. The owner's role can never be changed. */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const actorId = await requireUserId();
  const { projectId, userId: targetId } = await params;
  await authorizeProject(actorId, projectId, "members:update_role");
  const body = await readBody(req);
  const role = parseAssignableRole(body.role);

  if (targetId === actorId)
    throw new ApiError(400, "You cannot change your own role.");

  const { memberships } = await collections();
  const target = await memberships.findOne({ projectId, userId: targetId });
  if (!target) throw new ApiError(404, "Member not found.");
  if (target.role === "owner")
    throw new ApiError(403, "The owner's role cannot be changed.");

  if (target.role !== role) {
    await memberships.updateOne(
      { projectId, userId: targetId },
      { $set: { role, updatedAt: new Date() } },
    );
    await recordAudit({
      projectId,
      actorId,
      action: "member.role_changed",
      targetType: "member",
      targetId,
      metadata: { from: target.role, to: role },
    });
  }

  return json({ member: { userId: targetId, email: target.email, role } });
});

/**
 * Remove a member. Members may always remove themselves (leave), except the
 * owner. Removing someone else needs members:remove, and never the owner.
 */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const actorId = await requireUserId();
  const { projectId, userId: targetId } = await params;
  const leaving = targetId === actorId;
  await authorizeProject(
    actorId,
    projectId,
    leaving ? "project:read" : "members:remove",
  );

  const { memberships, environmentAccess } = await collections();
  const target = await memberships.findOne({ projectId, userId: targetId });
  if (!target) throw new ApiError(404, "Member not found.");
  if (target.role === "owner")
    throw new ApiError(
      403,
      leaving
        ? "The owner cannot leave the project."
        : "The owner cannot be removed.",
    );

  await memberships.deleteOne({ projectId, userId: targetId });
  await environmentAccess.deleteMany({ projectId, userId: targetId });
  await recordAudit({
    projectId,
    actorId,
    action: leaving ? "member.left" : "member.removed",
    targetType: "member",
    targetId,
    metadata: { role: target.role },
  });

  return json({ ok: true });
});
