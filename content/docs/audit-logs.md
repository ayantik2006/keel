---
title: Audit logs
description: Which events Keel records, how to inspect and filter them, what each entry contains, and how to investigate unexpected changes.
updated: 2026-10-11
---

The audit log is an append-only record of security-relevant activity in a project. Owners and admins can read it in **Settings**, **Audit Logs**.

## Which actions are recorded

| Category | Actions |
|---|---|
| Secrets | `secret.created`, `secret.updated`, `secret.deleted`, `secret.revealed`, `secret.version_revealed`, `secret.rolled_back`, `secrets.exported`, `secrets.imported` |
| Access | `member.role_changed`, `member.removed`, `member.left`, `invitation.created`, `invitation.revoked`, `invitation.accepted`, `environment.access_granted`, `environment.access_revoked`, `environment.access_denied` |
| Project | `project.created`, `project.updated`, `project.deleted` |
| Integrations | `integration.connected`, `integration.updated`, `integration.disconnected`, `integration.synced`, `integration.deploy_triggered` |

Notes on specific events:

- `secret.revealed` is written when a value is returned by the secret value endpoint (reveal and copy in the dashboard, or the API). Repeats by the same person on the same secret within 60 seconds are recorded once.
- `secrets.exported` is written for each environment export. `keel run` and `keel secrets list --reveal` both use the export endpoint, so each produces one event with the number of keys and `via: cli`.
- `environment.access_denied` is throttled to one per person per environment per 60 seconds, so it is not a complete count of attempts.
- Secret events carry `via` (`web` or `cli`) where the CLI can perform the action.

## What an entry contains

```json
{
  "id": "0a5f...",
  "at": "2026-10-11T09:42:10.512Z",
  "action": "secret.updated",
  "targetType": "secret",
  "targetId": "7c1e...",
  "metadata": {
    "key": "DATABASE_URL",
    "environment": "production",
    "version": 4,
    "valueChanged": true,
    "via": "web"
  },
  "actor": {
    "userId": "user_...",
    "email": "alice@example.com",
    "isYou": false,
    "isMember": true
  }
}
```

`isMember` is `false` when the actor has since been removed from the project. The email is then `null`.

## Inspect and filter

In **Audit Logs** you can filter by **Category** (All events, Secrets, Members and access, Project, Integrations), by **Actor**, and by a **From** and **To** date. Entries are shown newest first, and **Load more** fetches the next page. Filtering by exact action is available through the API.

The API is `GET /api/projects/:projectId/audit` with `category`, `action`, `actor`, `from`, `to`, `limit` and `cursor`. See [Audit API](/docs/api/audit).

## Investigate an unexpected change

1. Set **Category** to Secrets and the **From** and **To** dates around the day you noticed the change.
2. Find the `secret.updated` or `secret.deleted` event for the key and note the actor and `via`.
3. Check the secret's [version history](/docs/version-history) to see what changed. The audit entry never contains values.
4. Look for `secret.revealed` or `secrets.exported` events by the same actor around the same time.
5. If a credential may have been exposed, rotate it at its source first, then update Keel.
6. Review **Access** events for role changes and new grants around the same time.

## Why values are never logged

Logs are copied, exported and read by more people than the secrets themselves. Keel's audit metadata holds only fixed fields such as key name, environment and version number. Error handling follows the same rule: server errors log the error type, never the request or the message, since those could contain a value.

## What is not recorded

- Sign-in and sign-out, including CLI login and revocation. Authentication events belong to Clerk.
- Listing secret keys and metadata.
- Reading the audit log, the member list or the security overview.
- Failed requests that never reached authorization, such as an invalid token.

## Retention

Entries are kept without an expiry and cannot be edited or deleted through the application. Deleting a project does not remove its audit entries from the database.

:::note
The Security panel in the dashboard describes audit retention as "kept until the project is deleted". The delete handler in the current code keeps the entries. This page follows the code.
:::

## Next steps

Read the [Security model](/docs/security/model).
