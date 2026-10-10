import { collections } from "@/lib/db";
import {
  ApiError,
  authorizeProject,
  handler,
  json,
  requireUserId,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ projectId: string; invitationId: string }> };

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId, invitationId } = await params;
  await authorizeProject(userId, projectId, "invitations:revoke");

  const { invitations } = await collections();
  const result = await invitations.findOneAndUpdate(
    { _id: invitationId, projectId, status: "pending" },
    { $set: { status: "revoked", revokedBy: userId, revokedAt: new Date() } },
  );
  if (!result) throw new ApiError(404, "Invitation not found.");

  await recordAudit({
    projectId,
    actorId: userId,
    action: "invitation.revoked",
    targetType: "invitation",
    targetId: invitationId,
    metadata: { email: result.email, role: result.role },
  });

  return json({ ok: true });
});
