# keel CLI

Authenticate, choose a project and environment, manage secrets, and run local
commands with secrets injected into their environment. Zero runtime
dependencies; Node.js 20 or newer.

Status: tested on Windows 11 with Node 22. Linux and macOS paths are written
but have **not** been tested here (see "Platform support").

## Install (local development, no publishing)

From the repository root:

```bash
npm run cli:build           # compiles cli/src to cli/dist
node cli/dist/index.js --help
```

To get an `keel` command on your PATH while developing:

```bash
cd cli && npm link          # undo with: npm unlink -g keel
```

The package is marked `"private": true` so it cannot be published by accident.
Remove that flag deliberately when you are ready to publish.

## Quick start

```bash
keel login --api-url https://your-server.example   # or set KEEL_API_URL
cd my-project
keel init                 # pick a project and environment
keel secrets set DB_URL   # prompts for the value (hidden)
keel secrets list
keel run -- npm run dev
```

For local development against `npm run dev` use `--api-url http://localhost:3000`.
Plain `http` is only accepted for `localhost`, `127.0.0.1` and `[::1]`.

## Commands

| Command | What it does |
|---|---|
| `keel login [--api-url URL] [--no-browser]` | Browser-approved sign-in (device code flow) |
| `keel logout` | Revokes this machine's session on the server and deletes local credentials |
| `keel init [--project ID] [--env SLUG]` | Saves project and environment to `.keel.json` |
| `keel secrets list [--reveal] [--json] [--env SLUG]` | Lists keys; values masked unless `--reveal` |
| `keel secrets set KEY=VALUE...` | Creates or updates secrets |
| `keel secrets set KEY` | Prompts for the value without echoing it |
| `echo -n v \| keel secrets set KEY --stdin` | Reads the value from stdin |
| `keel run [--env SLUG] -- CMD ARGS...` | Runs CMD with secrets in its environment |

`keel <command> --help` shows details. Exit codes: `0` success, `1` error,
`2` bad arguments, `127` command not found; `run` returns the child's own exit
code (`128 + n` if it was ended by signal `n`).

## How authentication works

1. `login` asks the server for a device code and prints a short code and a link.
2. You open the link, sign in through the normal web login, and approve the code.
3. The CLI receives a **1 hour access token** and a **30 day refresh token**.
   Refresh tokens are single use and rotate; reusing an old one revokes the
   whole session. Tokens are stored on the server only as hashes.
4. Every request still goes through the same project membership, role and
   environment-access checks as the web app. A CLI token is accepted only by
   the endpoints the CLI needs: project list and detail, secret list, read,
   create, update, and environment export. It cannot manage members,
   invitations, access grants or deletions.

To sign out every CLI everywhere, call `DELETE /api/cli/sessions` from a
browser session (there is no UI button yet).

### Where credentials are stored

| Platform | Store | Notes |
|---|---|---|
| Windows | File containing a **DPAPI** blob (`%APPDATA%\keel-cli\credentials.dpapi`) | Bound to your Windows user; unreadable by other users or machines. Tested. |
| macOS / Linux | `~/.config/keel-cli/credentials.json`, mode `0600` in a `0700` directory | Protected by file permissions only. **Not an OS keychain.** Not tested here. |

Override the directory with `KEEL_CONFIG_DIR`. Force the file store with
`KEEL_CREDENTIAL_STORE=file`. If Windows protection cannot be used, the CLI
warns and falls back to the user-only file. Passwords are never handled by the
CLI at all: sign-in happens in the browser.

## Project configuration: `.keel.json`

```json
{ "apiUrl": "https://...", "projectId": "…", "environment": "development", "projectName": "…" }
```

It holds identifiers only, never tokens or secret values, and is validated on
every use (malformed ids, non-https URLs and unexpected content are rejected).
The CLI looks in the current directory and then parent directories.
`environment` is the environment slug, the identifier the API uses.

It contains nothing secret, but it is specific to you, so keep it out of Git:

```gitignore
.keel.json
```

To switch project or environment, run `keel init` again, or pass
`--env` to a single command.

## Runtime injection: what it does and does not protect

`keel run` fetches the environment over HTTPS from the authorized API,
builds the child's environment in memory, and starts your command with
`spawn(file, args, { shell: false })`. Secrets are never written to a file,
never printed, and never placed on a command line. Secrets override inherited
variables of the same name. The executable is located using your own `PATH`,
not one supplied by a secret.

Limitations you should know about:

- The command and **every process it starts** can read the injected variables.
- Environment variables can leak through process inspection (`/proc`, task
  managers, `ps eww`), crash dumps, error reporters, debug endpoints, and any
  program that logs its environment.
- Another process running as the same user can usually read them too.
- Memory is not zeroed; the values exist in this process until it exits.
- On Windows, `.cmd` and `.bat` files (such as `npm.cmd`) can only be started
  through `cmd.exe`. Arguments are escaped, but `%VAR%` expansion by `cmd.exe`
  cannot be fully disabled, so avoid passing untrusted text in arguments there.
  Secrets are not passed as arguments, so this does not expose them.
- Windows does not deliver POSIX signals. Termination ends the whole process
  tree with `taskkill`. Forwarding of SIGINT/SIGTERM/SIGHUP on Linux and macOS
  is implemented but untested here.

## Environment variables

| Variable | Purpose |
|---|---|
| `KEEL_API_URL` | Server URL (alternative to `--api-url` / `.keel.json`) |
| `KEEL_CONFIG_DIR` | Directory for credentials |
| `KEEL_CREDENTIAL_STORE` | `file` forces the file store |
| `KEEL_DEBUG` | `1` prints the type of unexpected errors |

There is no default server URL; one must be provided.

## Troubleshooting

| Message | Cause and fix |
|---|---|
| `You are not logged in` | Run `keel login`. |
| `session has expired or was revoked` | The refresh token expired or the session was revoked. Run `keel login`. |
| `No .keel.json found` | Run `keel init` in the project directory. |
| `You do not have access to this environment` | An admin must grant you that environment in project settings. |
| `You are logged in to X, but this project uses Y` | Run `keel login --api-url Y`. |
| `Could not reach host` | Check the URL, your network, and that the server is running. |
| `The API URL must use https` | Use https, or `localhost` for local development. |
| `Too many requests` | Rate limited; wait for the time shown. |
| `Command not found` (`run`) | The command is not on your `PATH`. |

## Known limitations

- No OS keychain integration on macOS or Linux.
- Rate limiting is in server memory per instance (see server docs); put a
  shared limiter in front for multi-instance deployments.
- Only create and update through the CLI; deleting secrets is web-only on purpose.
- `secrets set` stores the value on the server encrypted, but the value
  necessarily exists in the CLI process and, if typed as an argument, in shell
  history.
- Login events and session revocations are not recorded in the audit log (the
  log is per project); secret creates, updates and exports are, with `via: cli`.
