import { createHash, randomBytes, randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import {
  ApiError,
  authorizeProject,
  handler,
  isDuplicateKeyError,
  json,
  parseAssignableRole,
  parseEmail,
  parseInviteEnvironments,
  readBody,
  requireUserId,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { canHaveEnvironmentGrant } from "@/lib/permissions";

type Ctx = { params: Promise<{ projectId: string }> };

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "invitations:read");

  const { invitations, environments } = await collections();
  const docs = await invitations
    .find({ projectId, status: "pending" })
    .sort({ createdAt: -1 })
    .toArray();
  const now = Date.now();

  const wanted = [...new Set(docs.flatMap((i) => i.environmentIds ?? []))];
  const slugById = new Map(
    wanted.length
      ? (await environments.find({ projectId, _id: { $in: wanted } }).toArray()).map(
          (e) => [e._id, e.slug] as const,
        )
      : [],
  );

  return json({
    invitations: docs.map((i) => ({
      id: i._id,
      email: i.email,
      role: i.role,
      environments: (i.environmentIds ?? []).flatMap((id) => slugById.get(id) ?? []),
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      expired: i.expiresAt.getTime() <= now,
    })),
  });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  const { project } = await authorizeProject(
    userId,
    projectId,
    "members:invite",
  );
  const body = await readBody(req);
  const email = parseEmail(body.email);
  const role = parseAssignableRole(body.role);
  const envSlugs = parseInviteEnvironments(body.environments);

  if (envSlugs.length > 0) {
    if (!canHaveEnvironmentGrant(role))
      throw new ApiError(400, "Admins already have access to every environment.");
    // Granting environment access is its own permission, separate from inviting.
    await authorizeProject(userId, projectId, "environments:manage");
  }

  const { invitations, memberships, environments } = await collections();

  const envDocs = envSlugs.length
    ? await environments.find({ projectId, slug: { $in: envSlugs } }).toArray()
    : [];
  if (envDocs.length !== envSlugs.length)
    throw new ApiError(400, "Unknown environment.");

  if (await memberships.findOne({ projectId, email }))
    throw new ApiError(409, "This person is already a member.");

  // A pending but expired invite should not block a fresh one.
  await invitations.updateMany(
    {
      projectId,
      email,
      status: "pending",
      expiresAt: { $lte: new Date() },
    },
    { $set: { status: "revoked", revokedBy: userId, revokedAt: new Date() } },
  );

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const invitation = {
    _id: randomUUID(),
    projectId: project._id,
    inviterId: userId,
    email,
    role,
    ...(envDocs.length ? { environmentIds: envDocs.map((e) => e._id) } : {}),
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    status: "pending" as const,
    createdAt: now,
  };

  try {
    await invitations.insertOne(invitation);
  } catch (err) {
    if (isDuplicateKeyError(err))
      throw new ApiError(409, "An invitation for this email is already pending.");
    throw err;
  }

  await recordAudit({
    projectId,
    actorId: userId,
    action: "invitation.created",
    targetType: "invitation",
    targetId: invitation._id,
    metadata: { email, role, ...(envSlugs.length ? { environments: envSlugs.join(",") } : {}) },
  });

  const origin = new URL(req.url).origin;
  return json(
    {
      invitation: {
        id: invitation._id,
        email,
        role,
        environments: envSlugs,
        createdAt: now.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
        expired: false,
      },
      // No email delivery is configured. In development the link is returned
      // once so it can be shared by hand. It is never returned in production,
      // and the token is never logged. The token sits in the URL fragment, so
      // it is not sent to any server until the user accepts.
      ...(process.env.NODE_ENV !== "production"
        ? { devAcceptUrl: `${origin}/invite#${token}` }
        : {}),
    },
    201,
  );
});
