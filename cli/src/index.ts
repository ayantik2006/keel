#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { CliError } from "./errors.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { initCommand } from "./commands/init.js";
import { secretsCommand } from "./commands/secrets.js";
import { runCommandCli } from "./commands/run.js";

const HELP = `keel: manage secrets and run commands with secrets injected.

Usage: keel <command> [options]

Commands:
  login              Sign in through your browser
  logout             Revoke this machine's session and delete credentials
  init               Choose a project and environment for this directory
  secrets list       List secret keys (values hidden by default)
  secrets set        Create or update secrets
  run -- <command>   Run a command with secrets in its environment

Options:
  -h, --help         Show help (also: keel <command> --help)
  -v, --version      Show the version

Environment variables:
  KEEL_API_URL            Server URL (or use --api-url / .keel.json)
  KEEL_CONFIG_DIR         Where credentials are kept
  KEEL_CREDENTIAL_STORE   Set to "file" to force the file credential store
`;

function version(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    return JSON.parse(readFileSync(url, "utf8")).version as string;
  } catch {
    return "unknown";
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      process.stdout.write(HELP);
      return 0;
    case "-v":
    case "--version":
      process.stdout.write(`${version()}\n`);
      return 0;
    case "login":
      await loginCommand(rest);
      return 0;
    case "logout":
      await logoutCommand(rest);
      return 0;
    case "init":
      await initCommand(rest);
      return 0;
    case "secrets":
      await secretsCommand(rest);
      return 0;
    case "run":
      return runCommandCli(rest);
    default:
      throw new CliError(`Unknown command "${command}". Run \`keel --help\`.`);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    if (err instanceof CliError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exitCode = err.exitCode;
      return;
    }
    // Argument parsing errors from node:util have safe messages.
    const code = (err as { code?: string } | null)?.code;
    if (typeof code === "string" && code.startsWith("ERR_PARSE_ARGS")) {
      process.stderr.write(`Error: ${(err as Error).message}\nSee --help.\n`);
      process.exitCode = 2;
      return;
    }
    // Never print unexpected error details: they could contain request data.
    process.stderr.write(
      "Error: something went wrong. Set KEEL_DEBUG=1 for the error type.\n",
    );
    if (process.env.KEEL_DEBUG === "1" && err instanceof Error)
      process.stderr.write(`(${err.name})\n`);
    process.exitCode = 1;
  },
);
