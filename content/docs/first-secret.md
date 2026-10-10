---
title: Your first secret
description: Create, view, update, mask and delete a secret, with the permissions each action needs and how version history works.
updated: 2026-10-11
---

This page walks through the life of one secret in the dashboard and states the permission each step requires.

## Prerequisites

A project with at least one environment, and a role that can write secrets (`owner`, `admin` or `member`) with access to that environment. See [Projects and access control](/docs/access-control).

## Create a secret

1. Open **Secrets** and select your project and environment.
2. Choose **Add Secret**.
3. Enter a **Key** and a **Value**, then save.

The key must start with a letter or underscore, contain only letters, numbers and underscores, and be at most 128 characters. The value must not be empty and can be up to 10,000 characters. A key can appear only once per environment.

Requires `secrets:create`. The result is version 1.

## View and mask

The list shows keys, a masked value, the version and when it was last updated. Values are not sent to the browser until you ask:

1. Choose the reveal button on the row (labelled `Reveal value of KEY`).
2. The value is fetched from the server, decrypted, and shown.
3. Choose the same button again (now `Hide value of KEY`) to mask it.

A copy button (`Copy value of KEY`) fetches the value the same way and puts it on your clipboard.

Requires `secrets:read`. Every reveal is written to the audit log as `secret.revealed`, with the key and environment but not the value. Repeated reveals of the same secret by the same person within a minute are recorded once.

:::warning
Viewers can reveal values. The `viewer` role is read-only, not value-blind. Grant it with the same care as any other role.
:::

## Update a value

1. Choose the `Edit KEY` button on the row.
2. Change the value (and optionally the key), then save.

Requires `secrets:update`. A changed value creates a new version, for example v2, and the previous value is kept. Saving the same value again does nothing and creates no version. Renaming only the key does not create a version.

If two people edit the same secret at once, the second save is rejected with `409` and asks you to reload, so a newer value is never silently overwritten.

## Version history

Choose the `Version history of KEY` button on a row to see every version, who made it, when, and what kind of change it was. You can reveal an old value or restore it. See [Version history and rollback](/docs/version-history).

## Delete a secret

1. Choose the `Delete KEY` button on the row and confirm.

Requires `secrets:delete`, so `owner`, `admin` or `member`. Deleting removes the secret and its entire version history, and records `secret.deleted`. It is not possible through the CLI, on purpose.

:::note
Deleting a secret does not remove it from systems that already received it. If the Vercel integration is connected, the variable is removed from Vercel on the next sync, but a running deployment keeps the old environment until you redeploy.
:::

## Next steps

Install the CLI in [CLI installation](/docs/cli/installation), or read about [Managing secrets](/docs/managing-secrets) in more depth.
