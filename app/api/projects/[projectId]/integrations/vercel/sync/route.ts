import { collections } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  authorizeProject,
  handler,
  json,
  readBody,
  requireUserId,
} from "@/lib/api";
import { performSync } from "@/lib/vercel-sync";

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * Manual sync, optionally followed by a redeploy. Runs to completion and
 * returns the outcome. Concurrent runs are refused rather than interleaved.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "integrations:manage");
  rateLimit(`vercel-sync:${userId}`, { limit: 6, windowMs: 60_000 });

  const body = await readBody(req).catch(() => ({}) as Record<string, unknown>);
  const redeploy = body.redeploy === true;

  const { integrations } = await collections();
  const integ = await integrations.findOne({ projectId, provider: "vercel" });
  if (!integ || !integ.vercelProjectId)
    throw new ApiError(400, "Link a Vercel project first.");
  if (integ.status === "attention")
    throw new ApiError(400, "Reconnect Vercel before syncing.");

  const summary = await performSync(integ._id, {
    actorId: userId,
    forceRedeploy: redeploy,
    mode: "manual",
  });
  if (summary.status === "busy")
    throw new ApiError(409, "A sync is already running. It will pick up your changes.");

  return json({ summary });
});
