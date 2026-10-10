---
title: Runtime secret injection
description: Run any command with Keel secrets in its environment using keel run, and understand how it works, what it protects, and how failures behave.
updated: 2026-10-11
---

`keel run` fetches the secrets of an environment and starts your command with them added to its environment. Nothing is written to disk.

## Prerequisites

You are logged in and have run `keel init` in your project directory. See [Project initialization](/docs/cli/initialization).

## Usage

```bash
keel login
keel init
keel secrets list
keel run -- npm run dev
```

Everything after `--` is the command and its arguments:

```bash
keel run -- npm run dev
keel run --env staging -- node server.js --port 8080
```

| Option | Purpose |
|---|---|
| `--env <slug>` | Use another environment for this run |
| `-h`, `--help` | Show help |

The `--` is required. Without a command the CLI answers `Provide a command after --`.

## How it works

1. The CLI loads `.keel.json` and your stored credentials.
2. It requests `GET /api/projects/:projectId/environments/:env/export` over HTTPS. The server checks your project role and environment access before decrypting anything.
3. It builds the child's environment in memory: your current environment plus the secrets. Secrets override inherited variables of the same name.
4. It starts the command directly, without a shell, and forwards your terminal.
5. Secret values are never placed on a command line, printed, or written to a file.
6. The CLI prints `Injecting N secrets from <project> / <environment>` to stderr, then gets out of the way.

Each run is recorded as one `secrets.exported` audit event with the key count and `via: cli`.

## Reading the variables

Your application reads them like any environment variable:

```js
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
```

Do not log them. To confirm they arrived without exposing values, print names or lengths:

```js
console.log("DATABASE_URL set:", Boolean(process.env.DATABASE_URL));
```

## Why this can be safer than a `.env` file

- There is no plaintext file to commit, copy, back up or leave behind.
- Access is checked and audited on every run, and can be revoked by removing a role or grant.
- Values change in one place, and the next run picks them up.

## What it does not protect against

Runtime injection reduces exposure. It does not eliminate it.

- The command and every process it starts can read the variables.
- Environment variables can leak through process inspection tools such as `ps eww` or `/proc`, crash dumps, error reporters, debug endpoints, and programs that log their environment.
- Other processes running as the same user can usually read them.
- Memory is not zeroed. Values exist in the CLI process until it exits.
- On Windows, `.cmd` and `.bat` files such as `npm.cmd` must run through `cmd.exe`. Arguments are escaped, but `%VAR%` expansion cannot be fully disabled, so do not pass untrusted text as arguments there. Secrets are not passed as arguments.

## Failures

| Situation | What happens |
|---|---|
| Not logged in | Exits with `You are not logged in. Run keel login.` The command does not start. |
| Session expired or revoked | Exits with `Your session has expired or was revoked. Run keel login.` |
| No `.keel.json` | Exits with `No .keel.json found. Run keel init ...` |
| No access to the environment | Exits with `You do not have access to this environment.` |
| Server unreachable | Exits with `Could not reach <host>. Check the API URL and your network connection.`, or a timeout message after 30 seconds. The command does not start, and there is no cached copy of secrets. |
| Any one secret cannot be decrypted | The request fails as a whole with `Some secrets could not be decrypted.` You never get a partial environment. |
| Rate limit | 30 exports per minute per user. `Too many requests.` |

Because there is no offline fallback, a Keel outage blocks `keel run`. Applications that are already running keep the variables they started with.

## Exit codes and signals

| Code | Meaning |
|---|---|
| The child's own code | `keel run` returns exactly what your command returned |
| `128 + n` | The child ended because of signal `n` |
| `127` | Command not found on your `PATH` |
| `1` | CLI error, such as authentication or access |
| `2` | Invalid CLI arguments |

On Linux and macOS, `SIGINT`, `SIGTERM` and `SIGHUP` are forwarded to the child, and the child is cleaned up if the CLI goes away. These paths are implemented but not tested on those platforms yet. Windows does not deliver POSIX signals, so termination ends the whole process tree with `taskkill`.

## Next steps

Connect your deployment platform with [Integrations](/docs/integrations).
