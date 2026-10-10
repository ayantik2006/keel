import { ApiError, handler, json, readBody } from "@/lib/api";
import { refreshSession } from "@/lib/cli-auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/** Exchanges a refresh token for a new pair. Refresh tokens are single use. */
export const POST = handler(async (req: Request) => {
  rateLimit(`cli-refresh:${clientKey(req)}`, { limit: 30, windowMs: 60_000 });
  const body = await readBody(req);
  const token = body.refreshToken;
  if (typeof token !== "string" || !token.startsWith("keel_rt_") || token.length > 200)
    throw new ApiError(401, "Invalid refresh token. Run `keel login`.");

  const session = await refreshSession(token);
  if (!session)
    throw new ApiError(
      401,
      "Your CLI session has expired or was revoked. Run `keel login`.",
    );
  return json(session);
});
