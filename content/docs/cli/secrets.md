---
title: Retrieving and setting secrets
description: List secret keys, create and update secrets with the Keel CLI, select an environment, and understand permissions and errors.
updated: 2026-10-11
---

The CLI can list and set secrets in the environment chosen by `keel init`. Deleting secrets is dashboard-only on purpose.

## Prerequisites

You are logged in and have run `keel init`. See [CLI authentication](/docs/cli/authentication) and [Project initialization](/docs/cli/initialization).

## List secrets

```bash
keel secrets list
```

```text
KEY           VALUE         VERSION  UPDATED
API_KEY       ********      v1       2026-10-11T09:30:00.000Z
DATABASE_URL  ********      v3       2026-10-11T10:02:41.000Z
```

Keys are sorted alphabetically. Values are not fetched at all in this mode. `keel secrets ls` is an alias.

| Option | Behavior |
|---|---|
| `--json` | Output `[{ "key", "version", "updatedAt" }]`, or key and value with `--reveal` |
| `--reveal` | Fetch and print values. Needs read permission and is recorded in the audit log as `secrets.exported`. |
| `--env <slug>` | Use another environment for this command |

:::warning
`--reveal` prints plaintext to your terminal and anything capturing it, such as CI logs or screen recordings. Prefer `keel run`.
:::

## Set secrets

Create a secret or update it if the key exists. The safest forms do not put the value on the command line.

Prompt for the value, hidden:

```bash
keel secrets set DATABASE_URL
```

Read it from standard input:

```bash
printf '%s' "$VALUE" | keel secrets set API_KEY --stdin
```

Inline, for quick local values:

```bash
keel secrets set FEATURE_FLAG=on LOG_LEVEL=debug
```

Inline values can be saved in shell history and are visible to other processes, so the CLI warns when you use this form.

Output names the key and version, never the value:

```text
Created FEATURE_FLAG (v1)
Updated LOG_LEVEL (v2)
Unchanged API_KEY (v3)
```

`Unchanged` means the value was identical and no version was created. Every real change is a new [version](/docs/version-history).

Rules: keys use letters, numbers and underscores and cannot start with a number. Values cannot be empty and are limited to 10,000 characters. `--stdin` accepts a single key. Giving the same key twice is an error. Everything is validated before the first request is sent.

## Select an environment

By default the CLI uses the environment in `.keel.json`. Override per command:

```bash
keel secrets list --env staging
keel secrets set --env staging API_KEY
```

## Permissions and errors

| Action | Permission needed |
|---|---|
| `secrets list` | `secrets:read` in the environment |
| `secrets list --reveal` | `secrets:read`, rate limited to 30 per minute |
| `secrets set` (new key) | `secrets:create` |
| `secrets set` (existing key) | `secrets:update` |

| Message | Meaning |
|---|---|
| `You do not have access to this environment.` | No grant for it. Ask an admin. |
| `You do not have permission to do this.` | Your role lacks the permission. |
| `This secret was changed by someone else. Reload and try again.` | A concurrent change. Run the command again. |
| `Too many requests. Try again in Ns.` | You hit a rate limit. |

When updating, the CLI sends the version it read as `expectedVersion`, so it never overwrites a newer change unseen.

## Next steps

Run your application with [Runtime secret injection](/docs/cli/run).
