import { createHash, randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import {
  ApiError,
  handler,
  isDuplicateKeyError,
  json,
  readBody,
  requireUserId,
} from "@/lib/api";
import { getIdentity } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import { canHaveEnvironmentGrant } from "@/lib/permissions";

const INVALID = "This invitation is invalid, expired, or already used.";

/**
 * Accepts an invitation. The signed-in user's verified email must match the
 * invited email, and the token is single use: the status flip is one atomic
 * update that only succeeds while the invitation is pending and unexpired.
 */
export const POST = handler(async (req: Request) => {
  const userId = await requireUserId();
  const body = await readBody(req);
  const token = body.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 200)
    throw new ApiError(400, INVALID);

  const identity = await getIdentity();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { invitations, memberships, environments, environmentAccess } =
    await collections();

  const invitation = await invitations.findOne({ tokenHash });
  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt.getTime() <= Date.now()
  )
    throw new ApiError(410, INVALID);

  if (!identity.emails.includes(invitation.email))
    throw new ApiError(
      403,
      "This invitation was sent to a different email address.",
    );

  const now = new Date();
  const claimed = await invitations.findOneAndUpdate(
    { _id: invitation._id, status: "pending", expiresAt: { $gt: now } },
    { $set: { status: "accepted", acceptedBy: userId, acceptedAt: now } },
  );
  if (!claimed) throw new ApiError(410, INVALID);

  let joined = false;
  try {
    await memberships.insertOne({
      _id: randomUUID(),
      projectId: invitation.projectId,
      userId,
      role: invitation.role,
      email: invitation.email,
      ...(identity.name ? { name: identity.name } : {}),
      createdAt: now,
      updatedAt: now,
    });
    joined = true;
  } catch (err) {
    if (!isDuplicateKeyError(err)) {
      // Give the invitation back so the user can retry.
      await invitations.updateOne(
        { _id: invitation._id },
        {
          $set: { status: "pending" },
          $unset: { acceptedBy: "", acceptedAt: "" },
        },
      );
      throw err;
    }
    // Already a member: the invitation is consumed and no role is changed.
  }

  // Apply the environments chosen at invite time. Only for a new member: an
  // existing member keeps the access they already have. If a grant fails the
  // person simply ends up with less access, never more.
  if (
    joined &&
    invitation.environmentIds?.length &&
    canHaveEnvironmentGrant(invitation.role)
  ) {
    const envDocs = await environments
      .find({
        projectId: invitation.projectId,
        _id: { $in: invitation.environmentIds },
      })
      .toArray();
    for (const env of envDocs) {
      try {
        await environmentAccess.insertOne({
          _id: randomUUID(),
          projectId: invitation.projectId,
          environmentId: env._id,
          userId,
          grantedBy: invitation.inviterId,
          createdAt: now,
        });
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        continue;
      }
      await recordAudit({
        projectId: invitation.projectId,
        actorId: invitation.inviterId,
        action: "environment.access_granted",
        targetType: "environment",
        targetId: env._id,
        metadata: {
          environment: env.slug,
          userId,
          role: invitation.role,
          via: "invitation",
        },
      });
    }
  }

  await recordAudit({
    projectId: invitation.projectId,
    actorId: userId,
    action: "invitation.accepted",
    targetType: "invitation",
    targetId: invitation._id,
    metadata: { role: invitation.role },
  });

  return json({ projectId: invitation.projectId, role: invitation.role });
});
