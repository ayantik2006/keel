import { headers } from "next/headers";
import { handler, json } from "@/lib/api";
import { revokeSession, verifyAccessToken } from "@/lib/cli-auth";

/**
 * Revokes the CLI session behind the presented access token. Idempotent:
 * an unknown or already-expired token still returns ok, so logout never fails
 * on the client side.
 */
export const POST = handler(async () => {
  const authorization = (await headers()).get("authorization") ?? "";
  const match = /^Bearer\s+(keel_at_\S+)$/i.exec(authorization);
  if (match) {
    const session = await verifyAccessToken(match[1]);
    if (session) await revokeSession(session._id);
  }
  return json({ ok: true });
});
