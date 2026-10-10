---
title: Members, access and invitations API
description: Endpoints to list and manage project members, send and accept invitations, and grant or revoke environment access.
updated: 2026-10-11
---

These endpoints manage who can use a project. All of them require a browser session. CLI tokens are rejected with `403`.

## Members

### GET /api/projects/:projectId/members

Permission: `members:read` (every role).

```json
{
  "members": [
    {
      "userId": "user_...",
      "email": "alice@example.com",
      "name": "Alice Example",
      "role": "owner",
      "isYou": true,
      "createdAt": "2026-10-01T08:00:00.000Z"
    }
  ]
}
```

`email` and `name` are omitted when unknown.

### PATCH /api/projects/:projectId/members/:userId

Permission: `members:update_role` (admin or owner).

Request body: `{ "role": "admin" | "member" | "viewer" }`

Response `200`: `{ "member": { "userId": "...", "email": "...", "role": "member" } }`

Errors: `400 Role must be admin, member, or viewer.`, `400 You cannot change your own role.`, `403 The owner's role cannot be changed.`, `404 Member not found.`

### DELETE /api/projects/:projectId/members/:userId

Removes a member and their environment grants. Removing someone else needs `members:remove`. Removing yourself (leaving) needs only membership. The owner can be neither removed nor leave.

Response `200`: `{ "ok": true }`

Errors: `403 The owner cannot be removed.`, `403 The owner cannot leave the project.`, `404 Member not found.`

## Invitations

### GET /api/projects/:projectId/invitations

Permission: `invitations:read` (admin or owner). Lists pending invitations.

```json
{
  "invitations": [
    {
      "id": "9b2d...",
      "email": "bob@example.com",
      "role": "member",
      "environments": ["development"],
      "createdAt": "2026-10-11T09:00:00.000Z",
      "expiresAt": "2026-10-18T09:00:00.000Z",
      "expired": false
    }
  ]
}
```

### POST /api/projects/:projectId/invitations

Permission: `members:invite`. Granting environments with `environments` additionally needs `environments:manage`.

| Field | Type | Rules |
|---|---|---|
| `email` | string, required | Valid email, up to 254 characters |
| `role` | string, required | `admin`, `member` or `viewer` |
| `environments` | string array, optional | Slugs to grant on acceptance. Not allowed for `admin`, who already have every environment. |

```json
{ "email": "bob@example.com", "role": "member", "environments": ["development"] }
```

Response `201`:

```json
{
  "invitation": {
    "id": "9b2d...",
    "email": "bob@example.com",
    "role": "member",
    "environments": ["development"],
    "createdAt": "2026-10-11T09:00:00.000Z",
    "expiresAt": "2026-10-18T09:00:00.000Z",
    "expired": false
  },
  "devAcceptUrl": "https://keel.example.com/invite#<token>"
}
```

`devAcceptUrl` is returned only when the server is not running in production mode. In production no invitation link is returned and no email is sent, so there is currently no delivery path.

Invitations expire after 7 days. Errors: `400`, `409 This person is already a member.`, `409 An invitation for this email is already pending.`

### DELETE /api/projects/:projectId/invitations/:invitationId

Permission: `invitations:revoke`. Response `200`: `{ "ok": true }`. Errors: `404 Invitation not found.`

### POST /api/invitations/accept

Accepts an invitation as the signed-in user. The token travels in the URL fragment of the invitation link, so it is not sent to a server until the invitee accepts.

Request body: `{ "token": "<invitation token>" }`

Response `200`: `{ "projectId": "...", "role": "member" }`

Errors: `403 This invitation was sent to a different email address.`, `410 This invitation is invalid, expired, or already used.`

The invitee's verified email must match the invited address, and the token works once.

## Environment access

### GET /api/projects/:projectId/environment-access

Permission: `environments:manage`. Returns the member by environment matrix.

```json
{
  "environments": ["development", "staging", "production"],
  "members": [
    {
      "userId": "user_...",
      "email": "bob@example.com",
      "role": "member",
      "isYou": false,
      "secretPermissions": ["secrets:read", "secrets:create", "secrets:update", "secrets:delete"],
      "access": { "development": "granted", "staging": "none", "production": "none" }
    }
  ]
}
```

`access` is `implicit` (owner, admin), `granted` or `none`.

### PUT /api/projects/:projectId/environments/:env/access/:userId

Permission: `environments:manage`. Grants a member or viewer access to one environment. Idempotent.

Response `200`: `{ "ok": true, "access": "granted" }`

Errors: `400 Owners and admins already have access to every environment.`, `404 Environment not found.`, `404 Member not found.`

### DELETE /api/projects/:projectId/environments/:env/access/:userId

Permission: `environments:manage`. Revokes the grant. Takes effect on the next request.

Response `200`: `{ "ok": true, "access": "none" }`

## Security considerations

- Role and access changes are audited. See [Audit logs](/docs/audit-logs).
- Invitation tokens are stored only as hashes and never logged.
- Granting an admin role gives implicit access to all environments, including production.

## Next steps

See the [Audit and integrations API](/docs/api/audit).
