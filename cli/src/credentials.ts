import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { configDir } from "./paths.js";

/** Everything needed to call the API. Never printed, never put in project config. */
export type Credentials = {
  apiUrl: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  email?: string;
};

export interface CredentialStore {
  readonly kind: string;
  read(): Promise<Credentials | null>;
  write(credentials: Credentials): Promise<void>;
  delete(): Promise<void>;
}

function isCredentials(value: unknown): value is Credentials {
  const v = value as Record<string, unknown> | null;
  return (
    !!v &&
    typeof v.apiUrl === "string" &&
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.accessExpiresAt === "string" &&
    typeof v.refreshExpiresAt === "string"
  );
}

function parse(text: string): Credentials | null {
  try {
    const value = JSON.parse(text);
    return isCredentials(value) ? value : null;
  } catch {
    return null;
  }
}

/** JSON with non-ASCII escaped, so it survives any console code page. */
function serialize(c: Credentials): string {
  return JSON.stringify(c).replace(
    /[\u0080-￿]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

/**
 * Plain file, readable only by the current user (mode 0600 in a 0700
 * directory). On POSIX that is the protection. On Windows the mode bits do
 * nothing and only the profile's folder permissions apply, which is why
 * Windows uses DpapiStore by default.
 */
export class FileStore implements CredentialStore {
  readonly kind = "file";
  private file = path.join(configDir(), "credentials.json");

  async read() {
    try {
      return parse(await readFile(this.file, "utf8"));
    } catch {
      return null;
    }
  }
  async write(c: Credentials) {
    await ensureDir(path.dirname(this.file));
    await writeFile(this.file, serialize(c), { mode: 0o600 });
    await chmod(this.file, 0o600).catch(() => {});
  }
  async delete() {
    await rm(this.file, { force: true });
  }
}

function powershell(script: string, stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error("powershell failed")),
    );
    // Secret travels over stdin, never in the command line.
    child.stdin.end(stdin);
  });
}

const DPAPI_ENCRYPT =
  "$i=[Console]::In.ReadToEnd(); ConvertTo-SecureString $i -AsPlainText -Force | ConvertFrom-SecureString";
const DPAPI_DECRYPT =
  "$b=[Console]::In.ReadToEnd().Trim(); $s=ConvertTo-SecureString $b; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}";

/**
 * Windows: the credential file holds a DPAPI blob. DPAPI keys are bound to the
 * current Windows user account, so the file is useless to other users or other
 * machines. Implemented with the built-in PowerShell, no native modules.
 */
export class DpapiStore implements CredentialStore {
  readonly kind = "windows-dpapi";
  private file = path.join(configDir(), "credentials.dpapi");

  async read() {
    let blob: string;
    try {
      blob = await readFile(this.file, "utf8");
    } catch {
      return null;
    }
    try {
      return parse(await powershell(DPAPI_DECRYPT, blob));
    } catch {
      return null;
    }
  }
  async write(c: Credentials) {
    const blob = await powershell(DPAPI_ENCRYPT, serialize(c));
    await ensureDir(path.dirname(this.file));
    await writeFile(this.file, blob, { mode: 0o600 });
  }
  async delete() {
    await rm(this.file, { force: true });
  }
}

/**
 * Chooses the store. Set KEEL_CREDENTIAL_STORE=file to force the file
 * store. On Windows the DPAPI store is the default; if it cannot be used the
 * file store is the fallback (with a warning), never plaintext by surprise.
 */
export async function openCredentialStore(
  warn: (message: string) => void = () => {},
): Promise<CredentialStore> {
  if (process.env.KEEL_CREDENTIAL_STORE === "file") return new FileStore();
  if (process.platform === "win32") {
    try {
      await powershell("Write-Output ok", "");
      return new DpapiStore();
    } catch {
      warn(
        "Windows credential protection is unavailable; storing credentials in a user-only file instead.",
      );
    }
  }
  return new FileStore();
}
