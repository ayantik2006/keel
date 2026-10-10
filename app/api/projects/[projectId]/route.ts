import { collections } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import {
  ApiError,
  authorizeProject,
  handler,
  isDuplicateKeyError,
  json,
  loadProjectDetails,
  parseDescription,
  parseProjectName,
  readBody,
  requireAuth,
  requireUserId,
  serializeProject,
} from "@/lib/api";
import { grantedEnvironmentIds, visibleEnvironments } from "@/lib/environment-access";

type Ctx = { params: Promise<{ projectId: string }> };

async function respond(userId: string, projectId: string) {
  const { project, membership } = await authorizeProject(
    userId,
    projectId,
    "project:read",
  );
  const { envs, counts } = await loadProjectDetails([project._id]);
  const granted = await grantedEnvironmentIds(userId, [project._id]);
  const visible = visibleEnvironments(membership.role, envs, granted);
  return json({ project: serializeProject(project, visible, counts, membership) });
}

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const { userId } = await requireAuth({ allowCli: true });
  const { projectId } = await params;
  return respond(userId, projectId);
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  const { project: existing } = await authorizeProject(
    userId,
    projectId,
    "project:update",
  );
  const body = await readBody(req);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  const unset: Record<string, ""> = {};
  if ("name" in body) {
    const name = parseProjectName(body.name);
    update.name = name;
    update.nameLower = name.toLowerCase();
  }
  if ("description" in body) {
    const description = parseDescription(body.description);
    if (description) update.description = description;
    else unset.description = "";
  }
  if (!("name" in body) && !("description" in body))
    throw new ApiError(400, "Nothing to update.");

  const { projects } = await collections();
  try {
    await projects.updateOne(
      { _id: existing._id },
      Object.keys(unset).length
        ? { $set: update, $unset: unset }
        : { $set: update },
    );
  } catch (err) {
    if (isDuplicateKeyError(err))
      throw new ApiError(409, "A project with this name already exists.");
    throw err;
  }

  await recordAudit({
    projectId: existing._id,
    actorId: userId,
    action: "project.updated",
    targetType: "project",
    targetId: existing._id,
    metadata: {
      ...("name" in update && update.name !== existing.name
        ? { fromName: existing.name, toName: String(update.name) }
        : {}),
      descriptionChanged: "description" in body,
    },
  });

  return respond(userId, projectId);
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  const { project } = await authorizeProject(
    userId,
    projectId,
    "project:delete",
  );

  const {
    projects,
    environments,
    secrets,
    memberships,
    invitations,
    environmentAccess,
    secretVersions,
    integrations,
    integrationVars,
  } = await collections();
  // Children first so a failure part-way leaves a project that can be retried.
  // Audit logs are intentionally kept.
  const linked = await integrations.find({ projectId: project._id }).toArray();
  for (const i of linked)
    await integrationVars.deleteMany({ integrationId: i._id });
  await integrations.deleteMany({ projectId: project._id });
  await secretVersions.deleteMany({ projectId: project._id });
  await secrets.deleteMany({ projectId: project._id });
  await environments.deleteMany({ projectId: project._id });
  await invitations.deleteMany({ projectId: project._id });
  await environmentAccess.deleteMany({ projectId: project._id });
  await memberships.deleteMany({ projectId: project._id });
  await projects.deleteOne({ _id: project._id });
  await recordAudit({
    projectId: project._id,
    actorId: userId,
    action: "project.deleted",
    targetType: "project",
    targetId: project._id,
    metadata: { name: project.name },
  });

  return json({ ok: true });
});
