import { randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import { handler, isDuplicateKeyError, json, readBody } from "@/lib/api";
import {
  DEVICE_TTL_MS,
  POLL_INTERVAL_SECONDS,
  newDeviceCode,
  newUserCode,
  sha256,
} from "@/lib/cli-auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Starts a CLI login. Unauthenticated by design: the CLI has no credentials
 * yet. It only creates a pending request that a signed-in user must approve in
 * the browser, so it grants nothing by itself.
 */
export const POST = handler(async (req: Request) => {
  rateLimit(`cli-device:${clientKey(req)}`, { limit: 10, windowMs: 60_000 });
  const body = await readBody(req);
  const deviceName =
    typeof body.deviceName === "string"
      ? body.deviceName.replace(/[^\w .@-]/g, "").slice(0, 60).trim()
      : "";

  const { cliDevices } = await collections();
  const deviceCode = newDeviceCode();
  const now = new Date();

  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = newUserCode();
    try {
      await cliDevices.insertOne({
        _id: randomUUID(),
        deviceCodeHash: sha256(deviceCode),
        userCode,
        status: "pending",
        deviceName: deviceName || "Unnamed device",
        createdAt: now,
        expiresAt: new Date(now.getTime() + DEVICE_TTL_MS),
      });
      const origin = new URL(req.url).origin;
      return json({
        deviceCode,
        userCode,
        verificationUrl: `${origin}/cli/authorize?code=${userCode}`,
        expiresIn: DEVICE_TTL_MS / 1000,
        interval: POLL_INTERVAL_SECONDS,
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  return json({ error: "Could not start login. Try again." }, 503);
});
