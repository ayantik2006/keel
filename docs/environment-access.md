# Environment access control

## Effective permission rule

A request to a secret in environment `E` of project `P` is allowed only if both hold:

1. **Role permission.** The caller's project role has the permission (for
   example `secrets:update`). See `lib/permissions.ts`.
2. **Environment access.** The caller can access `E`:

| Role | Environment access |
|---|---|
| Owner | Implicit, every environment |
| Admin | Implicit, every environment (they can manage grants, so this equals what they could grant themselves) |
| Member | Only environments with an explicit grant. No grant means denied. |
| Viewer | Only environments with an explicit grant. No grant means denied. |

A grant never raises a role. A viewer with a Production grant is still
read-only. Production is not special-cased: every environment is deny by
default for members and viewers.

Enforcement is in `authorizeEnvironment` (`lib/api.ts`), which every secret
route calls before reading or decrypting anything. Denials return 403 and are
audited (`environment.access_denied`, de-duplicated per actor and environment
for 60 seconds).

Environments a member or viewer cannot access are omitted from project
responses (`environments`, `secretCounts`).

## Data

Collection `environment_access`: `{ projectId, environmentId, userId, grantedBy, createdAt }`,
unique on `(environmentId, userId)`, indexed on `(projectId, userId)`.
Grants are deleted when the member is removed or leaves, and when the project
is deleted. Grants are not kept for owners or admins.

## Endpoints (admin or owner only)

- `GET  /api/projects/:id/environment-access` returns the member x environment matrix.
- `PUT  /api/projects/:id/environments/:env/access/:userId` grants access.
- `DELETE /api/projects/:id/environments/:env/access/:userId` revokes access.

## Migration

`npm run migrate:env-access` (dry run) and `npm run migrate:env-access -- --apply`.

Before this feature every member and viewer could use every environment. The
migration grants each existing member and viewer explicit access to every
non-production environment of their projects, so day to day work continues.
It never grants production. An owner or admin must grant production
deliberately. Additive and idempotent; nothing is modified or deleted.

Without running the migration, existing members and viewers have no
environment access until granted (the safe default).

## Limitations

- Admins have implicit access to all environments; they cannot be restricted.
- Grants are all-or-nothing per environment; the role decides read vs write.
  There is no per-grant read-only level for members.
- Invitations do not carry environment grants; an admin grants access after
  the invitee joins.
- Audit entries for denied attempts are throttled, so they are not a complete
  count of attempts.
