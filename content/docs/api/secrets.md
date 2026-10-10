---
title: Secrets API
description: Endpoints to list, create, read, update and delete secrets, view and restore versions, and import and export an environment.
updated: 2026-10-11
---

All secret endpoints are scoped to a project and an environment. `:projectId` is the project id and `:env` is `development`, `staging` or `production`.

```text
/api/projects/:projectId/environments/:env/...
```

Each request is authorized by project membership, then the permission shown, then environment access, before any secret is read or decrypted. See [API overview](/docs/api/overview#authorization-model).

## The secret object

Lists and writes return metadata only:

```json
{
  "id": "7c1e0b52-0000-0000-0000-000000000000",
  "key": "DATABASE_URL",
  "version": 3,
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-11T09:30:00.000Z"
}
```

## List secrets

### GET /api/projects/:projectId/environments/:env/secrets

Permission: `secrets:read`. Accepts a CLI token. Returns metadata for every secret, most recently updated first. No values.

```bash
curl -s "$KEEL_URL/api/projects/$PROJECT_ID/environments/development/secrets" \
  -H "Authorization: Bearer $KEEL_ACCESS_TOKEN"
```

Response `200`: `{ "secrets": [ <secret>, ... ] }`

## Create a secret

### POST /api/projects/:projectId/environments/:env/secrets

Permission: `secrets:create`. Accepts a CLI token.

| Field | Type | Rules |
|---|---|---|
| `key` | string, required | Letters, digits, underscores, not starting with a digit. Up to 128 characters. Unique in the environment. |
| `value` | string, required | 1 to 10,000 characters |

```bash
curl -s -X POST "$KEEL_URL/api/projects/$PROJECT_ID/environments/development/secrets" \
  -H "Authorization: Bearer $KEEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"API_KEY","value":"dev-key-not-a-real-credential"}'
```

Response `201`: `{ "secret": <secret> }` with `version` 1.

Errors: `400` invalid key or value, `403`, `409 A secret with this key already exists in this environment.`

## Read a secret value

### GET /api/projects/:projectId/environments/:env/secrets/:secretId

Permission: `secrets:read`. Accepts a CLI token. Returns the decrypted value. This is the only single-secret endpoint that returns a value, and each call is audited as `secret.revealed`.

```json
{
  "secret": {
    "id": "7c1e0b52-0000-0000-0000-000000000000",
    "key": "API_KEY",
    "value": "dev-key-not-a-real-credential",
    "version": 1,
    "updatedAt": "2026-10-11T09:30:00.000Z"
  }
}
```

Errors: `404 Secret not found.`, `500 This secret could not be decrypted.` The request fails closed, and nothing partial is returned.

## Update a secret

### PATCH /api/projects/:projectId/environments/:env/secrets/:secretId

Permission: `secrets:update`. Accepts a CLI token.

| Field | Type | Notes |
|---|---|---|
| `key` | string, optional | Rename. Does not create a version. |
| `value` | string, optional | New value. Creates a new version if it differs from the current value. |
| `expectedVersion` | integer, optional | Only apply if the secret is still at this version, else `409` |

At least one of `key` and `value` is required. If nothing actually changes, the response is the current metadata and no version is created.

```bash
curl -s -X PATCH "$KEEL_URL/api/projects/$PROJECT_ID/environments/development/secrets/$SECRET_ID" \
  -H "Authorization: Bearer $KEEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"new-placeholder-value","expectedVersion":1}'
```

Response `200`: `{ "secret": <secret> }`

Errors: `400 Nothing to update.`, `400 expectedVersion must be a positive integer.`, `409 This secret was changed by someone else. Reload and try again.`, `409` on a key clash.

Without `expectedVersion` the write is retried against the latest version, and the value it replaces is always kept as a version.

## Delete a secret

### DELETE /api/projects/:projectId/environments/:env/secrets/:secretId

Permission: `secrets:delete`. Browser session only. Removes the secret and its version history.

Response `200`: `{ "ok": true }`

## Version history

### GET /api/projects/:projectId/environments/:env/secrets/:secretId/versions

Permission: `secrets:read`. Browser session only. Metadata only, newest first.

```json
{
  "currentVersion": 3,
  "versions": [
    {
      "versionNumber": 3,
      "changeType": "ROLLED_BACK",
      "key": "DATABASE_URL",
      "isCurrent": true,
      "restoredFromVersion": 1,
      "createdAt": "2026-10-11T09:30:00.000Z",
      "changedBy": { "userId": "user_...", "email": "alice@example.com", "isYou": true, "isMember": true }
    }
  ]
}
```

`changeType` is one of `CREATED`, `UPDATED`, `ROLLED_BACK`, `BASELINE`. `changedBy` is `null` for baseline records.

### GET /api/projects/:projectId/environments/:env/secrets/:secretId/versions/:versionNumber

Permission: `secrets:read`. Browser session only. Returns one historical value, audited as `secret.version_revealed`.

Response `200`: `{ "version": { "versionNumber": 1, "value": "..." } }`. Errors: `404 Version not found.`

### POST /api/projects/:projectId/environments/:env/secrets/:secretId/versions/:versionNumber/restore

Permission: `secrets:update`. Browser session only. Writes the old value as a new version.

Request body: a JSON object, which may be empty. Optional `expectedVersion` (integer).

```json
{ "expectedVersion": 3 }
```

Response `200`: `{ "secret": <secret> }` with the new version number.

Errors: `400 This version is already the current value.`, `404 Version not found.`, `409` on a concurrent change.

## Export an environment

### GET /api/projects/:projectId/environments/:env/export

Permission: `secrets:read`. Accepts a CLI token. Rate limited to 30 per minute per user. Returns every secret with its value, sorted by key.

```json
{ "secrets": [ { "key": "API_KEY", "value": "..." }, { "key": "DATABASE_URL", "value": "..." } ] }
```

With `?format=dotenv` the response is `text/plain` with a `Content-Disposition` attachment named `.env.<environment>`. Values are quoted and escaped where needed.

If any single secret cannot be decrypted the request fails with `500 Some secrets could not be decrypted.` Every call is audited as `secrets.exported` with the key count.

## Import into an environment

### POST /api/projects/:projectId/environments/:env/import

Permission: `secrets:create`, plus `secrets:update` if any entry overwrites. Browser session only. Rate limited to 10 per minute per user. Up to 500 entries and 2,000,000 bytes.

```json
{
  "entries": [
    { "key": "STRIPE_PUBLIC_KEY", "value": "pk_test_placeholder", "overwrite": false },
    { "key": "LOG_LEVEL", "value": "debug", "overwrite": true }
  ]
}
```

The whole request is validated before anything is written. A key that already exists is changed only when `overwrite` is `true`; otherwise it is skipped.

```json
{
  "summary": { "created": 1, "updated": 1, "unchanged": 0, "skipped": 0, "failed": 0 },
  "results": [
    { "key": "STRIPE_PUBLIC_KEY", "status": "created" },
    { "key": "LOG_LEVEL", "status": "updated" }
  ]
}
```

`status` is `created`, `updated`, `unchanged`, `skipped` or `failed`. Failed entries carry a fixed `error` string.

Errors: `400`, `403 You do not have permission to overwrite secrets.`, `413 The import is too large.`

## Security considerations

- Anything that returns a value is audited. Treat tokens that can call these endpoints as secret.
- Do not log request or response bodies on the client side.
- Prefer `expectedVersion` for read-modify-write flows so a concurrent change is not lost.

## Next steps

See [Members, access and invitations](/docs/api/members).
