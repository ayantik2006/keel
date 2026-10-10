import { CliError } from "./errors.js";
import { ApiClient, normalizeApiUrl } from "./http.js";
import { openCredentialStore, type CredentialStore, type Credentials } from "./credentials.js";

export type Session = {
  client: ApiClient;
  store: CredentialStore;
  credentials: Credentials;
};

export const warn = (message: string) => process.stderr.write(`Warning: ${message}\n`);
export const info = (message: string) => process.stderr.write(`${message}\n`);

/**
 * Returns an authenticated client, or tells the user to log in. If the config
 * pins an API URL, credentials issued for a different server are not used.
 */
export async function requireSession(expectedApiUrl?: string): Promise<Session> {
  const store = await openCredentialStore(warn);
  const credentials = await store.read();
  if (!credentials) throw new CliError("You are not logged in. Run `keel login`.");

  if (expectedApiUrl && normalizeApiUrl(expectedApiUrl) !== normalizeApiUrl(credentials.apiUrl)) {
    throw new CliError(
      `You are logged in to ${normalizeApiUrl(credentials.apiUrl)}, but this project uses ${normalizeApiUrl(expectedApiUrl)}. Run \`keel login --api-url ${normalizeApiUrl(expectedApiUrl)}\`.`,
    );
  }
  return {
    client: new ApiClient(normalizeApiUrl(credentials.apiUrl), store, credentials),
    store,
    credentials,
  };
}
