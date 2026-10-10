import { collections } from "@/lib/db";
import {
  ApiError,
  handler,
  json,
  readBody,
  requireUserId,
} from "@/lib/api";
import { normalizeUserCode } from "@/lib/cli-auth";
import { getIdentity } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Approves or denies a pending CLI login. Browser session only: a CLI token
 * can never be used to mint another CLI token.
 */
export const POST = handler(async (req: Request) => {
  const userId = await requireUserId();
  rateLimit(`cli-approve:${userId}`, { limit: 10, windowMs: 60_000 });

  const body = await readBody(req);
  const userCode = normalizeUserCode(body.userCode);
  if (!userCode) throw new ApiError(400, "Enter the 8 character code from your terminal.");
  const approve = body.approve !== false;

  const { cliDevices } = await collections();
  const now = new Date();
  const identity = await getIdentity();

  const result = await cliDevices.findOneAndUpdate(
    { userCode, status: "pending", expiresAt: { $gt: now } },
    {
      $set: approve
        ? {
            status: "approved",
            userId,
            ...(identity.primaryEmail ? { email: identity.primaryEmail } : {}),
          }
        : { status: "denied", userId },
    },
    { projection: { deviceName: 1 } },
  );
  if (!result)
    throw new ApiError(404, "That code is invalid or has expired.");

  return json({ ok: true, approved: approve, deviceName: result.deviceName });
});
