import { collections } from "@/lib/db";
import {
  authorizeProject,
  handler,
  json,
  requireUserId,
} from "@/lib/api";

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "members:read");

  const { memberships } = await collections();
  const docs = await memberships
    .find({ projectId })
    .sort({ createdAt: 1 })
    .toArray();

  return json({
    members: docs.map((m) => ({
      userId: m.userId,
      email: m.email,
      name: m.name,
      role: m.role,
      isYou: m.userId === userId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});
