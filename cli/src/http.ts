import { CliError } from "./errors.js";
import type { CredentialStore, Credentials } from "./credentials.js";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** HTTPS is required except for loopback addresses used in local development. */
export function normalizeApiUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CliError(`"${input}" is not a valid URL.`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname)))
    throw new CliError(
      "The API URL must use https. Plain http is only allowed for localhost.",
    );
  if (url.username || url.password)
    throw new CliError("The API URL must not contain credentials.");
  return url.origin;
}

/** Turns a failed response into a message. Only the server's `error` text is used. */
async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  if (data && typeof data.error === "string") return data.error;
  if (res.status === 401) return "Authentication failed. Run `keel login`.";
  if (res.status === 403) return "You do not have permission to do this.";
  if (res.status === 404) return "Not found.";
  if (res.status === 429) return "Too many requests. Try again shortly.";
  return `The server returned an error (${res.status}).`;
}

export class ApiClient {
  constructor(
    private apiUrl: string,
    private store: CredentialStore,
    private creds: Credentials | null,
  ) {}

  /** Unauthenticated call (login flow). */
  static async publicPost<T>(apiUrl: string, path: string, body: unknown): Promise<{ status: number; data: T }> {
    const res = await fetchSafe(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    if (!res.ok && res.status >= 500) throw new CliError(await readErrorFrom(data, res.status));
    return { status: res.status, data };
  }

  /**
   * Authenticated request. On 401 it tries one token refresh, persists the new
   * pair, and retries once. A dead session is cleared and reported clearly.
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.creds)
      throw new CliError("You are not logged in. Run `keel login`.");

    let res = await this.send(method, path, body);
    if (res.status === 401) {
      await this.refresh();
      res = await this.send(method, path, body);
    }
    if (!res.ok) throw new CliError(await readError(res));
    return (await res.json()) as T;
  }

  private send(method: string, path: string, body?: unknown) {
    return fetchSafe(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.creds!.accessToken}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private async refresh() {
    const creds = this.creds!;
    const expired = () =>
      new CliError("Your session has expired or was revoked. Run `keel login`.");
    if (new Date(creds.refreshExpiresAt).getTime() <= Date.now()) {
      await this.store.delete();
      this.creds = null;
      throw expired();
    }
    const res = await fetchSafe(`${this.apiUrl}/api/cli/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: creds.refreshToken }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 400) {
        await this.store.delete();
        this.creds = null;
        throw expired();
      }
      throw new CliError(await readError(res));
    }
    const next = (await res.json()) as Partial<Credentials>;
    if (!next.accessToken || !next.refreshToken || !next.accessExpiresAt || !next.refreshExpiresAt)
      throw new CliError("The server sent an unexpected response.");
    this.creds = {
      apiUrl: creds.apiUrl,
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      accessExpiresAt: next.accessExpiresAt,
      refreshExpiresAt: next.refreshExpiresAt,
      email: next.email ?? creds.email,
    };
    await this.store.write(this.creds);
  }
}

async function readErrorFrom(data: unknown, status: number) {
  const e = (data as { error?: unknown } | null)?.error;
  return typeof e === "string" ? e : `The server returned an error (${status}).`;
}

async function fetchSafe(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return "the server";
      }
    })();
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new CliError(
      timedOut
        ? `The request to ${host} timed out.`
        : `Could not reach ${host}. Check the API URL and your network connection.`,
    );
  }
}
