---
title: Version history and rollback
description: How Keel records every value change, how to inspect old versions, and how restoring a version works, with the permissions and caveats involved.
updated: 2026-10-11
---

Every change to a secret's value is kept as a numbered version. You can inspect an earlier value and restore it.

## How versions are created

| Change | Version created |
|---|---|
| Secret created | Version 1, change type `CREATED` |
| Value changed | Next number, change type `UPDATED` |
| Version restored | Next number, change type `ROLLED_BACK`, with the version it came from |
| Key renamed only | None |
| Same value saved again | None |
| Secret existed before history was introduced | A `BASELINE` record holds its value at that time, with no author |

Versions are numbered per secret starting at 1 and always increase. The version shown in lists is the current one.

## Inspect history

In the dashboard choose the `Version history of KEY` button. Each entry shows the version number, when it was made and the change type, such as created, updated or restored from an earlier version. The API also reports who made the change. Values are not included until you reveal one.

- **Reveal** a version to see its value. Needs `secrets:read` and access to the environment. The reveal is audited as `secret.version_revealed`.
- The current version is marked, and it cannot be restored onto itself.

The API is `GET /api/projects/:projectId/environments/:env/secrets/:secretId/versions`. See [Secrets API](/docs/api/secrets#version-history).

## Restore a version

1. Open the version history of the secret.
2. Choose **Restore** on the version you want and confirm.

Keel writes the old value as a new version at the top of the history. For example, restoring v2 when the current version is v5 produces v6 with the value of v2. Versions 1 to 5 stay as they were.

Needs `secrets:update` and access to the environment. The audit log records `secret.rolled_back` with `restoredFromVersion` and `newVersion`.

## Concurrency

Writes are compare-and-set on the version number. When two people change the same secret at the same moment, one succeeds and the other receives `409` with `This secret was changed by someone else. Reload and try again.` Nobody's value is overwritten silently. API clients can send `expectedVersion` to make this check explicit.

## Operational caveats

- **Restoring does not redeploy anything.** Applications that already started keep the value they had. Restart them, or redeploy, to pick up the restored value. With the [Vercel integration](/docs/integrations/vercel), the restored value syncs, but a running deployment still needs a new deployment.
- **Deleting a secret deletes its history.** Versions are removed with it.
- **Everything is retained.** There is no retention limit or pruning today, so every historical value stays encrypted in the database until the secret or project is deleted.
- **Old values may be compromised values.** If you are rotating a leaked credential, restoring a version brings the leaked value back. Rotate at the source instead.
- **Dashboard only.** Listing versions, revealing them and restoring are not available to CLI credentials.
- **Re-encryption.** A restored value is encrypted again with a fresh nonce under the current key version.

## Next steps

See who changed what in [Audit logs](/docs/audit-logs).
