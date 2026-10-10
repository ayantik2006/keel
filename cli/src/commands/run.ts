import { parseArgs } from "node:util";
import { loadConfig } from "../config.js";
import { CliError } from "../errors.js";
import { info, requireSession } from "../session.js";
import { runCommand } from "../spawn.js";

export const RUN_HELP = `Usage: keel run [options] -- <command> [args...]

Fetches the secrets of the selected environment and starts <command> with
them added to its environment. Nothing is written to disk.

Examples:
  keel run -- npm run dev
  keel run --env staging -- node server.js --port 8080

Options:
  --env <slug>      Use another environment for this run
  -h, --help        Show this help

Security notes:
  The command and every process it starts can read the injected variables.
  Environment variables can also be exposed through process inspection tools,
  crash dumps, debug endpoints and child processes that log their environment.
  Secret values are never put on a command line by this tool.
`;

/**
 * Index where the child command begins. Normally that is the `--` separator,
 * but Windows PowerShell can swallow `--` before it reaches us, so fall back to
 * the first argument that is not one of our own options.
 */
function splitAt(argv: string[]): number {
  const sep = argv.indexOf("--");
  if (sep !== -1) return sep;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env") {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    return i;
  }
  return argv.length;
}

export async function runCommandCli(argv: string[]): Promise<number> {
  const split = splitAt(argv);
  const own = argv.slice(0, split);
  const command = argv.slice(split === argv.length ? split : split + (argv[split] === "--" ? 1 : 0));

  const { values } = parseArgs({
    args: own,
    options: {
      env: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(RUN_HELP);
    return 0;
  }
  if (command.length === 0)
    throw new CliError("Provide a command after `--`, e.g. keel run -- npm run dev");

  const { config } = await loadConfig();
  const environment = values.env ?? config.environment;
  const { client } = await requireSession(config.apiUrl);

  const { secrets } = await client.request<{ secrets: { key: string; value: string }[] }>(
    "GET",
    `/api/projects/${encodeURIComponent(config.projectId)}/environments/${encodeURIComponent(environment)}/export`,
  );

  // Secrets override inherited variables of the same name.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const s of secrets) env[s.key] = s.value;
  const count = secrets.length;
  secrets.length = 0; // drop our own references to the values

  info(
    `Injecting ${count} secret${count === 1 ? "" : "s"} from ${config.projectName ?? config.projectId} / ${environment}`,
  );
  return runCommand(command[0], command.slice(1), env);
}
