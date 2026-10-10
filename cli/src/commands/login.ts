import { spawn } from "node:child_process";
import os from "node:os";
import { parseArgs } from "node:util";
import { findConfigPath } from "../config.js";
import { CliError } from "../errors.js";
import { ApiClient, normalizeApiUrl } from "../http.js";
import { openCredentialStore, type Credentials } from "../credentials.js";
import { info, warn } from "../session.js";
import { readFile } from "node:fs/promises";

type DeviceStart = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
};

type TokenResponse = Partial<Credentials> & { status?: string; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function openBrowser(url: string) {
  // Argument array, no shell. The URL comes from our own server response.
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* printing the URL is enough */
  }
}

async function resolveApiUrl(flag?: string): Promise<string> {
  if (flag) return normalizeApiUrl(flag);
  if (process.env.KEEL_API_URL) return normalizeApiUrl(process.env.KEEL_API_URL);
  const file = await findConfigPath(process.cwd());
  if (file) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      if (typeof parsed.apiUrl === "string") return normalizeApiUrl(parsed.apiUrl);
    } catch {
      /* fall through */
    }
  }
  throw new CliError(
    "No API URL. Pass --api-url <url> or set KEEL_API_URL.",
  );
}

/** Runs the device authorization flow and stores the resulting credentials. */
export async function performLogin(opts: {
  apiUrl?: string;
  openBrowser?: boolean;
}): Promise<Credentials> {
  const apiUrl = await resolveApiUrl(opts.apiUrl);

  const start = await ApiClient.publicPost<DeviceStart & { error?: string }>(
    apiUrl,
    "/api/cli/auth/device",
    { deviceName: `${os.hostname()} (${process.platform})` },
  );
  if (start.status !== 200 || !start.data.deviceCode)
    throw new CliError(start.data.error ?? "Could not start login.");
  const { deviceCode, userCode, verificationUrl, expiresIn, interval } = start.data;

  info(`\nTo sign in, open this page and confirm the code:\n`);
  info(`  ${verificationUrl}\n`);
  info(`  Code: ${userCode}\n`);
  if (opts.openBrowser !== false) openBrowser(verificationUrl);
  info("Waiting for approval... (Ctrl+C to cancel)");

  const deadline = Date.now() + expiresIn * 1000;
  let delay = Math.max(interval, 1) * 1000;

  while (Date.now() < deadline) {
    await sleep(delay);
    const res = await ApiClient.publicPost<TokenResponse>(
      apiUrl,
      "/api/cli/auth/token",
      { deviceCode },
    );
    if (res.status === 202) continue;
    if (res.status === 429) {
      delay += 2000;
      continue;
    }
    if (res.status === 200 && res.data.status === "approved") {
      const d = res.data;
      if (!d.accessToken || !d.refreshToken || !d.accessExpiresAt || !d.refreshExpiresAt)
        throw new CliError("The server sent an unexpected response.");
      const credentials: Credentials = {
        apiUrl,
        accessToken: d.accessToken,
        refreshToken: d.refreshToken,
        accessExpiresAt: d.accessExpiresAt,
        refreshExpiresAt: d.refreshExpiresAt,
        ...(d.email ? { email: d.email } : {}),
      };
      const store = await openCredentialStore(warn);
      await store.write(credentials);
      return credentials;
    }
    if (res.data.status === "denied")
      throw new CliError("Login was denied in the browser.");
    throw new CliError("The login request expired. Run `keel login` again.");
  }
  throw new CliError("The login request expired. Run `keel login` again.");
}

export const LOGIN_HELP = `Usage: keel login [options]

Sign in through your browser. The CLI shows a short code; approve it on the
page that opens. Credentials are stored per user (Windows DPAPI on Windows, a
user-only file elsewhere) and are never printed.

Options:
  --api-url <url>   Server to sign in to (or set KEEL_API_URL)
  --no-browser      Print the link instead of opening a browser
  -h, --help        Show this help
`;

export async function loginCommand(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "api-url": { type: "string" },
      "no-browser": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  if (values.help) return void process.stdout.write(LOGIN_HELP);

  const creds = await performLogin({
    apiUrl: values["api-url"],
    openBrowser: !values["no-browser"],
  });
  info(`Logged in${creds.email ? ` as ${creds.email}` : ""}.`);
}
