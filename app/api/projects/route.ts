import { randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import {
  ApiError,
  envName,
  handler,
  isDuplicateKeyError,
  json,
  loadProjectDetails,
  parseDescription,
  parseEnvironments,
  parseProjectName,
  readBody,
  requireAuth,
  requireUserId,
  serializeProject,
} from "@/lib/api";
import { getIdentity } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import { grantedEnvironmentIds, visibleEnvironments } from "@/lib/environment-access";

/** Lists every project the user is a member of, with their role. */
export const GET = handler(async () => {
  const { userId } = await requireAuth({ allowCli: true });
  const { projects, memberships } = await collections();

  const mine = await memberships.find({ userId }).toArray();
  const docs = await projects
    .find({ _id: { $in: mine.map((m) => m.projectId) } })
    .sort({ updatedAt: -1 })
    .toArray();
  const { envs, counts } = await loadProjectDetails(docs.map((p) => p._id));
  const granted = await grantedEnvironmentIds(
    userId,
    docs.map((p) => p._id),
  );

  return json({
    projects: docs.map((p) => {
      const membership = mine.find((m) => m.projectId === p._id)!;
      const visible = visibleEnvironments(
        membership.role,
        envs.filter((e) => e.projectId === p._id),
        granted,
      );
      return serializeProject(p, visible, counts, membership);
    }),
  });
});

export const POST = handler(async (req: Request) => {
  const userId = await requireUserId();
  const body = await readBody(req);
  const name = parseProjectName(body.name);
  const description = parseDescription(body.description);
  const slugs = parseEnvironments(body.environments);
  const identity = await getIdentity();

  const { projects, environments, memberships } = await collections();
  const now = new Date();
  const project = {
    _id: randomUUID(),
    ownerId: userId,
    name,
    nameLower: name.toLowerCase(),
    ...(description ? { description } : {}),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await projects.insertOne(project);
  } catch (err) {
    if (isDuplicateKeyError(err))
      throw new ApiError(409, "A project with this name already exists.");
    throw err;
  }

  const envDocs = slugs.map((slug) => ({
    _id: randomUUID(),
    projectId: project._id,
    slug,
    name: envName(slug),
    createdAt: now,
  }));
  const membership = {
    _id: randomUUID(),
    projectId: project._id,
    userId,
    role: "owner" as const,
    ...(identity.primaryEmail ? { email: identity.primaryEmail } : {}),
    ...(identity.name ? { name: identity.name } : {}),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await environments.insertMany(envDocs);
    await memberships.insertOne(membership);
  } catch (err) {
    await Promise.all([
      memberships.deleteMany({ projectId: project._id }),
      environments.deleteMany({ projectId: project._id }),
      projects.deleteOne({ _id: project._id, ownerId: userId }),
    ]);
    throw err;
  }

  await recordAudit({
    projectId: project._id,
    actorId: userId,
    action: "project.created",
    targetType: "project",
    targetId: project._id,
  });

  return json(
    { project: serializeProject(project, envDocs, {}, membership) },
    201,
  );
});
