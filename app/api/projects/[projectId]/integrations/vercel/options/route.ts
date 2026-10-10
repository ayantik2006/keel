import { collections } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  authorizeProject,
  handler,
  json,
  requireUserId,
} from "@/lib/api";
import { TEAM_ID, VercelError, listProjects, listTeams } from "@/lib/vercel";
import { tokenOf } from "@/lib/vercel-sync";

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * Teams and projects the stored token can see, fetched server side (all
 * pages). Only ids and names reach the browser.
 */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "integrations:manage");
  rateLimit(`vercel-options:${userId}`, { limit: 20, windowMs: 60_000 });

  const teamId = new URL(req.url).searchParams.get("teamId") || undefined;
  if (teamId && !TEAM_ID.test(teamId)) throw new ApiError(400, "Invalid team ID.");

  const { integrations } = await collections();
  const integ = await integrations.findOne({ projectId, provider: "vercel" });
  if (!integ) throw new ApiError(404, "Connect Vercel first.");

  try {
    const token = await tokenOf(integ);
    const [teams, projects] = await Promise.all([
      listTeams(token).catch((err) => {
        // Tokens scoped to one team may not be allowed to list teams.
        if (err instanceof VercelError && err.kind === "permission") return [];
        throw err;
      }),
      listProjects(token, teamId ?? integ.teamId),
    ]);
    return json({ teams, projects });
  } catch (err) {
    if (err instanceof VercelError) {
      if (err.needsAttention)
        await integrations.updateOne({ _id: integ._id }, { $set: { status: "attention", lastError: err.message } });
      throw new ApiError(err.needsAttention ? 400 : 502, err.message);
    }
    throw err;
  }
});
