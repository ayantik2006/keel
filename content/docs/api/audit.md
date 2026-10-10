---
title: Audit and integrations API
description: Endpoints for the project audit log, the security overview, and the Vercel integration, with parameters and response shapes.
updated: 2026-10-11
---

These endpoints require a browser session and are available to owners and admins.

## Audit log

### GET /api/projects/:projectId/audit

Permission: `audit:read`. Events are returned newest first with cursor pagination.

| Query parameter | Type | Notes |
|---|---|---|
| `limit` | integer | 1 to 100, default 50 |
| `category` | string | `secrets`, `access`, `project` or `integrations` |
| `action` | string | An exact action such as `secret.updated`. Takes precedence over `category`. |
| `actor` | string | A user id |
| `from`, `to` | date | `YYYY-MM-DD` or a full ISO timestamp. A date-only `to` includes the whole day. |
| `cursor` | string | The `nextCursor` of the previous page |

```bash
curl -s "$KEEL_URL/api/projects/$PROJECT_ID/audit?category=secrets&limit=20" \
  -H "Cookie: $SESSION_COOKIE"
```

Response `200`:

```json
{
  "events": [
    {
      "id": "0a5f...",
      "at": "2026-10-11T09:42:10.512Z",
      "action": "secret.revealed",
      "targetType": "secret",
      "targetId": "7c1e...",
      "metadata": { "key": "API_KEY", "environment": "development", "via": "cli" },
      "actor": { "userId": "user_...", "email": "alice@example.com", "isYou": false, "isMember": true }
    }
  ],
  "nextCursor": "MjAyNi0xMC0xMVQwOTo0MjoxMC41MTJafDBhNWY..."
}
```

`nextCursor` is `null` on the last page. Errors: `400 Invalid cursor.`, `400 Invalid date filter.`, `400 Invalid category filter.`, `400 Invalid actor filter.`, `400 Invalid action filter.`

Event metadata never contains secret values or tokens. The recorded actions are listed in [Audit logs](/docs/audit-logs#which-actions-are-recorded).

## Security overview

### GET /api/projects/:projectId/security

Permission: `audit:read`. A read-only summary derived from the real state of the project: encryption facts, role counts, pending invitations, per-environment grants and integration status. It never returns key material, values or tokens.

```json
{
  "encryption": {
    "algorithm": "AES-256-GCM",
    "secretsEncryptedAtRest": true,
    "keyConfigured": true,
    "currentKeyVersion": 1,
    "records": { "total": 11, "onCurrentKeyVersion": 11, "other": 0 },
    "keyRotation": false,
    "externalKms": false
  },
  "authentication": { "provider": "Clerk", "cliAccessTokenMinutes": 60, "cliRefreshTokenDays": 30 },
  "access": { "members": { "owner": 1, "admin": 1, "member": 3, "viewer": 1 }, "pendingInvitations": 0 },
  "integrations": { "vercel": null },
  "auditLog": { "events": 128 }
}
```

The response also includes free-text notes and a per-environment grant summary, omitted above.

## Vercel integration

All Vercel endpoints require `integrations:manage` (admin or owner). The access token and deploy hook are never returned. See the [Vercel guide](/docs/integrations/vercel) for behavior.

### GET /api/projects/:projectId/integrations/vercel

Returns `{ "connected": false }` or the connection state:

```json
{
  "connected": true,
  "status": "active",
  "vercelProjectId": "prj_...",
  "vercelProjectName": "web-app",
  "teamId": null,
  "mappings": { "development": "development", "production": "production" },
  "autoRedeploy": false,
  "hookConfigured": false,
  "conflictPolicy": "skip",
  "lastSyncAt": "2026-10-11T09:30:00.000Z",
  "lastSyncStatus": "success",
  "lastError": null,
  "syncing": false,
  "pending": 0,
  "environments": ["development", "production"]
}
```

`status` is `connected` (token saved, no project linked), `active`, or `attention` (reconnect needed). The response also contains `lastRun` and `lastDeployment` details.

### POST /api/projects/:projectId/integrations/vercel

Connects or reconnects with a token. Rate limited to 10 per minute.

| Field | Type | Notes |
|---|---|---|
| `token` | string, required | A Vercel access token |
| `teamId` | string, optional | Looks like `team_xxxxxxxx` |

Response `201`: the connection state. Errors: `400 Enter a Vercel access token.`, `400 Team ID should look like team_xxxxxxxx.`, `400` or `502` with a fixed message when Vercel rejects the token.

### GET /api/projects/:projectId/integrations/vercel/options

Lists the Vercel teams and projects the stored token can see. Query: `teamId` (optional). Rate limited to 20 per minute. Only ids and names are returned.

Response `200`: `{ "teams": [ ... ], "projects": [ ... ] }`

### PUT /api/projects/:projectId/integrations/vercel

Links a Vercel project and sets the options.

| Field | Type | Notes |
|---|---|---|
| `vercelProjectId` | string, required | |
| `teamId` | string, optional | |
| `mappings` | object, required | Keel environment slug to `development`, `preview` or `production`. At least one, no two on the same target. |
| `conflictPolicy` | string, optional | `skip` (default) or `overwrite` |
| `autoRedeploy` | boolean, optional | Requires a deploy hook |
| `deployHookUrl` | string or null, optional | A URL on `api.vercel.com`. `null` removes it. |

```json
{
  "vercelProjectId": "prj_placeholder",
  "mappings": { "development": "development", "staging": "preview", "production": "production" },
  "conflictPolicy": "skip",
  "autoRedeploy": false
}
```

Response `200`: the connection state.

### POST /api/projects/:projectId/integrations/vercel/sync

Runs a sync now. Optional body `{ "redeploy": true }` also triggers the deploy hook. Rate limited to 6 per minute.

Response `200`: `{ "summary": { ... } }`. Errors: `400 Link a Vercel project first.`, `400 Reconnect Vercel before syncing.`, `409 A sync is already running. It will pick up your changes.`

### DELETE /api/projects/:projectId/integrations/vercel

Disconnects. Variables already in Vercel stay. Response `200`: `{ "ok": true }`.

## Next steps

Review [Error codes](/docs/api/errors).
