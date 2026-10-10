import { collections } from "@/lib/db";
import { ApiError, handler, json, readBody } from "@/lib/api";
import { createSession, sha256 } from "@/lib/cli-auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * The CLI polls here with its device code. Once the user approved, the next
 * poll atomically consumes the request and returns credentials exactly once.
 */
export const POST = handler(async (req: Request) => {
  rateLimit(`cli-token:${clientKey(req)}`, { limit: 60, windowMs: 60_000 });
  const body = await readBody(req);
  const deviceCode = body.deviceCode;
  if (typeof deviceCode !== "string" || deviceCode.length < 20 || deviceCode.length > 200)
    throw new ApiError(400, "Invalid device code.");

  const { cliDevices } = await collections();
  const hash = sha256(deviceCode);
  const request = await cliDevices.findOne({ deviceCodeHash: hash });
  if (!request) throw new ApiError(400, "Invalid device code.");

  if (request.expiresAt.getTime() <= Date.now() && request.status !== "consumed")
    return json({ status: "expired" }, 400);
  if (request.status === "denied") return json({ status: "denied" }, 400);
  if (request.status === "consumed")
    return json({ status: "expired" }, 400); // already used: single use
  if (request.status === "pending") return json({ status: "pending" }, 202);

  // approved: claim it once
  const claimed = await cliDevices.findOneAndUpdate(
    { _id: request._id, status: "approved" },
    { $set: { status: "consumed" } },
  );
  if (!claimed || !claimed.userId) return json({ status: "expired" }, 400);

  const session = await createSession({
    userId: claimed.userId,
    email: claimed.email,
    deviceName: claimed.deviceName,
  });
  return json({ status: "approved", ...session });
});
