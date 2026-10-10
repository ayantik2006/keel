import { parseArgs } from "node:util";
import { loadConfig, type ProjectConfig } from "../config.js";
import { CliError } from "../errors.js";
import { promptHidden, readStdin } from "../prompt.js";
import { info, requireSession, warn } from "../session.js";
import type { ApiClient } from "../http.js";

type SecretMeta = { id: string; key: string; version: number; updatedAt: string };

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_VALUE = 10_000;

export const SECRETS_HELP = `Usage: keel secrets <command>

Commands:
  list              List secret keys in the selected environment
  set KEY=VALUE...  Create or update secrets

Run \`keel secrets <command> --help\` for details.
`;

export const LIST_HELP = `Usage: keel secrets list [options]

Lists the keys in the environment chosen by \`keel init\`. Values are not
shown unless you ask for them.

Options:
  --reveal          Also fetch and show values (needs read permission; the
                    access is recorded in the audit log)
  --json            Output JSON
  --env <slug>      Use another environment for this command
  -h, --help        Show this help
`;

export const SET_HELP = `Usage: keel secrets set KEY=VALUE [KEY=VALUE...]
       keel secrets set KEY            (prompts for the value, hidden)
       echo -n "value" | keel secrets set KEY --stdin

Creates the secret, or updates it if the key already exists. Each change is a
new version in the secret's history. Values are never printed.

Note: a value written on the command line can be saved in your shell history
and is visible to other processes. Prefer the prompt or --stdin for anything
sensitive.

Options:
  --stdin           Read the value from standard input (single KEY only)
  --env <slug>      Use another environment for this command
  -h, --help        Show this help
`;

async function context(envOverride?: string) {
  const { config } = await loadConfig();
  const environment = envOverride ?? config.environment;
  const session = await requireSession(config.apiUrl);
  return { config: { ...config, environment } as ProjectConfig, client: session.client };
}

const secretsPath = (c: ProjectConfig) =>
  `/api/projects/${encodeURIComponent(c.projectId)}/environments/${encodeURIComponent(c.environment)}/secrets`;

async function listCommand(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      reveal: { type: "boolean" },
      json: { type: "boolean" },
      env: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  if (values.help) return void process.stdout.write(LIST_HELP);

  const { config, client } = await context(values.env);

  if (values.reveal) {
    warn("Showing secret values. This access is recorded in the audit log.");
    const { secrets } = await client.request<{ secrets: { key: string; value: string }[] }>(
      "GET",
      `/api/projects/${encodeURIComponent(config.projectId)}/environments/${encodeURIComponent(config.environment)}/export`,
    );
    if (values.json) return void console.log(JSON.stringify(secrets, null, 2));
    for (const s of secrets) console.log(`${s.key}=${s.value}`);
    return;
  }

  const { secrets } = await client.request<{ secrets: SecretMeta[] }>(
    "GET",
    secretsPath(config),
  );
  const sorted = [...secrets].sort((a, b) => a.key.localeCompare(b.key));
  if (values.json)
    return void console.log(
      JSON.stringify(
        sorted.map((s) => ({ key: s.key, version: s.version, updatedAt: s.updatedAt })),
        null,
        2,
      ),
    );

  if (sorted.length === 0) return void info(`No secrets in ${config.environment}.`);
  const width = Math.max(3, ...sorted.map((s) => s.key.length));
  console.log(`${"KEY".padEnd(width)}  VALUE         VERSION  UPDATED`);
  for (const s of sorted)
    console.log(
      `${s.key.padEnd(width)}  ${"********".padEnd(12)}  v${String(s.version).padEnd(6)}  ${s.updatedAt}`,
    );
}

function validate(key: string, value: string) {
  if (!KEY.test(key) || key.length > 128)
    throw new CliError(
      `"${key.slice(0, 40)}" is not a valid key. Use letters, numbers and underscores, not starting with a number.`,
    );
  if (value.length === 0) throw new CliError(`The value for ${key} is empty.`);
  if (value.length > MAX_VALUE)
    throw new CliError(`The value for ${key} is longer than ${MAX_VALUE} characters.`);
}

async function upsert(
  client: ApiClient,
  config: ProjectConfig,
  existing: Map<string, SecretMeta>,
  key: string,
  value: string,
): Promise<string> {
  const found = existing.get(key);
  if (found) {
    const { secret } = await client.request<{ secret: SecretMeta }>(
      "PATCH",
      `${secretsPath(config)}/${encodeURIComponent(found.id)}`,
      { value, expectedVersion: found.version },
    );
    return secret.version === found.version
      ? `Unchanged ${key} (v${secret.version})`
      : `Updated ${key} (v${secret.version})`;
  }
  const { secret } = await client.request<{ secret: SecretMeta }>(
    "POST",
    secretsPath(config),
    { key, value },
  );
  return `Created ${key} (v${secret.version})`;
}

async function setCommand(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      stdin: { type: "boolean" },
      env: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) return void process.stdout.write(SET_HELP);
  if (positionals.length === 0)
    throw new CliError("Provide KEY=VALUE, or a KEY to be prompted for. See --help.");

  // Resolve every pair before touching the server.
  const pairs: { key: string; value: string }[] = [];
  let inline = false;
  for (const arg of positionals) {
    const eq = arg.indexOf("=");
    if (eq === -1) {
      if (positionals.length > 1)
        throw new CliError("Prompting is only supported for a single KEY.");
      const value = values.stdin
        ? (await readStdin()).replace(/\r?\n$/, "")
        : await promptHidden(`Value for ${arg.slice(0, 40)}: `);
      pairs.push({ key: arg, value });
    } else {
      inline = true;
      pairs.push({ key: arg.slice(0, eq), value: arg.slice(eq + 1) });
    }
  }
  if (values.stdin && inline)
    throw new CliError("--stdin cannot be combined with KEY=VALUE.");
  for (const p of pairs) validate(p.key, p.value);
  if (new Set(pairs.map((p) => p.key)).size !== pairs.length)
    throw new CliError("The same key was given more than once.");

  if (inline)
    warn(
      "Values passed on the command line may be saved in your shell history. Use `keel secrets set KEY` to be prompted instead.",
    );

  const { config, client } = await context(values.env);
  const { secrets } = await client.request<{ secrets: SecretMeta[] }>(
    "GET",
    secretsPath(config),
  );
  const existing = new Map(secrets.map((s) => [s.key, s]));

  for (const p of pairs) {
    // Messages carry the key only, never the value.
    info(await upsert(client, config, existing, p.key, p.value));
  }
}

export async function secretsCommand(argv: string[]) {
  const [sub, ...rest] = argv;
  if (!sub || sub === "--help" || sub === "-h" || sub === "help")
    return void process.stdout.write(SECRETS_HELP);
  if (sub === "list" || sub === "ls") return listCommand(rest);
  if (sub === "set") return setCommand(rest);
  throw new CliError(`Unknown secrets command "${sub}". Try \`keel secrets --help\`.`);
}
