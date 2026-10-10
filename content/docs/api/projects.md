---
title: Projects and environments API
description: Endpoints to list, create, read, update and delete projects, including how environments and permissions are returned.
updated: 2026-10-11
---

Environments are part of a project. There are no standalone environment endpoints: environments are chosen when the project is created and appear in project responses.

## The project object

```json
{
  "id": "d4b1c8f0-0000-0000-0000-000000000000",
  "role": "owner",
  "permissions": ["project:read", "members:read", "secrets:read", "secrets:create"],
  "name": "Web App",
  "description": "Customer-facing web application",
  "environments": ["development", "staging", "production"],
  "secretCounts": { "development": 4, "staging": 4, "production": 3 },
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-11T09:30:00.000Z"
}
```

| Field | Notes |
|---|---|
| `role` | Your role in this project |
| `permissions` | Exactly what your role may do. Clients should reflect this list, not guess. |
| `environments` | Only environments you can access. Members and viewers do not see ones without a grant. |
| `secretCounts` | Per environment, for the environments listed |
| `description` | Omitted when empty |

## Endpoints

### GET /api/projects

Lists the projects you belong to, most recently updated first. Accepts a CLI token.

```bash
curl -s "$KEEL_URL/api/projects" -H "Authorization: Bearer $KEEL_ACCESS_TOKEN"
```

Response `200`: `{ "projects": [ <project>, ... ] }`

### POST /api/projects

Creates a project and makes you its owner. Browser session only.

| Field | Type | Rules |
|---|---|---|
| `name` | string, required | 1 to 60 characters. Unique among your projects, ignoring case. |
| `description` | string, optional | Up to 280 characters |
| `environments` | string array, required | One or more of `development`, `staging`, `production` |

```json
{ "name": "Web App", "description": "Customer-facing web application", "environments": ["development", "production"] }
```

Response `201`: `{ "project": <project> }`

Errors: `400` for invalid fields, `409 A project with this name already exists.`

### GET /api/projects/:projectId

Returns one project. Requires `project:read`. Accepts a CLI token.

Response `200`: `{ "project": <project> }`. Errors: `404 Project not found.`

### PATCH /api/projects/:projectId

Renames a project or changes its description. Requires `project:update` (admin or owner). Browser session only.

| Field | Type | Notes |
|---|---|---|
| `name` | string, optional | Same rules as creation |
| `description` | string or null, optional | An empty string or `null` clears it |

At least one field is required, or the API answers `400 Nothing to update.` Response `200`: `{ "project": <project> }`. Errors: `409` on a name clash.

### DELETE /api/projects/:projectId

Permanently deletes the project and its secrets, versions, members, invitations, environment access and integrations. Requires `project:delete` (owner only). Browser session only. Audit entries are kept.

Response `200`: `{ "ok": true }`.

:::warning
Deletion cannot be undone and has no confirmation step at the API level. Clients should confirm with the user first.
:::

## Security considerations

- Membership is checked before anything else. A project you do not belong to returns `404`, so ids cannot be probed.
- `permissions` is derived on the server for every request. Do not cache it across role changes.

## Next steps

See the [Secrets API](/docs/api/secrets).
