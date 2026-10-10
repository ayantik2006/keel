---
title: Managing secrets
description: Create, update, delete, search and safely handle secrets in Keel, including special characters, multiline values and masking.
updated: 2026-10-11
---

This guide covers day-to-day secret management in the dashboard. For a first walkthrough see [Your first secret](/docs/first-secret).

## Prerequisites

- A role that allows the action: `secrets:read`, `secrets:create`, `secrets:update` or `secrets:delete`. See [Projects and access control](/docs/access-control).
- Access to the environment you are working in.

## Create secrets

Choose **Add Secret** in the environment you want. One secret is one key and one value. To add many at once, use [Import and export](/docs/import-export).

From the CLI, `keel secrets set KEY` prompts for the value without echoing it. See [Retrieving and setting secrets](/docs/cli/secrets).

| Rule | Limit |
|---|---|
| Key characters | Letters, numbers and underscores, not starting with a number |
| Key length | 128 characters |
| Key uniqueness | One per environment |
| Value | Required, up to 10,000 characters |

## Update values

Update a secret with the `Edit KEY` button. A new value creates a new version and keeps the old one. See [Version history and rollback](/docs/version-history).

Renaming a key changes only its name. It does not create a version. If your application still reads the old name it will stop finding the variable, so rename and deploy together.

## Delete secrets

Deleting needs `secrets:delete` and is available in the dashboard only. It removes the secret and all its versions. Take a look at the [audit log](/docs/audit-logs) afterwards to confirm the `secret.deleted` event.

:::warning
Deletion is permanent. Keel does not keep a recoverable copy of a deleted secret or its history.
:::

## Search and filter

The secrets view has a **Search by key** box and a **Filter by last updated** control with these options: any time, last 24 hours, last 7 days, last 30 days. Search matches keys only. Values are never searched, because they are not available to the browser until revealed.

## Masked values

The list always shows `********` for the value. Revealing fetches that one value from the server, decrypts it and records `secret.revealed` in the audit log. Hide it again when you are done.

## Special characters and multiline values

Values are stored as text exactly as entered. Quotes, `#`, `$`, spaces, and line breaks are preserved. This is useful for certificates and private keys, which are multiline.

When you export an environment to a `.env` file, Keel quotes and escapes values that need it, so they survive a round trip. If you inject values with `keel run`, no file or quoting is involved: the value goes straight into the process environment.

:::note
Environment variables cannot contain a NUL character, so values containing one will not work as variables even though Keel will store them.
:::

## Safe practices for copying and exposing values

- Prefer `keel run` over copying values into a shell or a file.
- Do not paste values into chat, tickets or screenshots. If you must share one, rotate it afterwards.
- Remember that revealing and copying are audited, so an unexpected `secret.revealed` is worth investigating.
- Avoid `keel secrets set KEY=VALUE` on shared machines. The value lands in shell history. Use the prompt or `--stdin`.

See [Environment variable best practices](/docs/security/best-practices).

## Next steps

Learn how environments keep values apart in [Environments](/docs/environments).
