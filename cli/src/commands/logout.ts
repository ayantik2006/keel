import { parseArgs } from "node:util";
import { openCredentialStore } from "../credentials.js";
import { info, warn } from "../session.js";

export const LOGOUT_HELP = `Usage: keel logout

Revokes this machine's CLI session on the server and deletes the stored
credentials. Works offline too: local credentials are always removed.
`;

export async function logoutCommand(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: { help: { type: "boolean", short: "h" } },
    allowPositionals: false,
  });
  if (values.help) return void process.stdout.write(LOGOUT_HELP);

  const store = await openCredentialStore(warn);
  const creds = await store.read();
  if (!creds) return void info("You are not logged in.");

  let revoked = true;
  try {
    const res = await fetch(`${creds.apiUrl}/api/cli/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    revoked = res.ok;
  } catch {
    revoked = false;
  }
  await store.delete();
  info(
    revoked
      ? "Logged out."
      : "Logged out locally. The server could not be reached to revoke the session; it will expire on its own.",
  );
}
