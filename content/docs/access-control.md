---
title: Projects and access control
description: Roles, per-environment access, inviting members and troubleshooting permission errors in Keel.
updated: 2026-10-11
---

Access in Keel is the combination of two checks: your **role** in the project and your **access to the environment**. Both must allow an action.

## Roles and permissions

| Permission | viewer | member | admin | owner |
|---|---|---|---|---|
| Read the project and its member list | yes | yes | yes | yes |
| Read secret values (`secrets:read`) | yes | yes | yes | yes |
| Create, update, delete secrets | no | yes | yes | yes |
| Rename the project, edit description | no | no | yes | yes |
| Invite, change roles, remove members | no | no | yes | yes |
| Manage environment access | no | no | yes | yes |
| Manage integrations | no | no | yes | yes |
| Read the audit log and security overview | no | no | yes | yes |
| Delete the project | no | no | no | yes |

Reading secrets applies only to environments the person can access.

Rules to know:

- A project has one `owner`, the person who created it. Ownership transfer is not built.
- The owner's role cannot be changed and the owner cannot leave.
- You cannot change your own role.
- Admins can be assigned and removed by other admins and the owner.

## Environment-level access

| Role | Environment access |
|---|---|
| owner, admin | Every environment, implicitly |
| member, viewer | Only environments they were granted. No grant, no access. |

Grants are per person per environment. Admins and the owner cannot be restricted, and grants are not stored for them.

Environments a person cannot access are hidden from their project view and the CLI never offers them.

## Invite members

1. Open **Settings**, then **Members & Access**.
2. Enter an email in the **Invite by email** field.
3. Choose a role: admin, member or viewer.
4. For member or viewer, optionally choose environments to grant on acceptance.
5. Send the invitation.

Invitations last 7 days and can be used once. The invitee must sign in with an account whose verified email matches the invited address, then open the invitation link. Accepting adds them with the chosen role and grants.

:::warning
Keel does not send email yet. In a non-production build the invitation link is returned once in the dashboard so you can share it. In a production build (`NODE_ENV=production`) the link is not returned, so invitations cannot currently be delivered from the dashboard. Treat this as a known gap.
:::

Pending invitations can be revoked from the same screen.

## Change roles and remove members

From **Members & Access**:

- Change a member's role among admin, member and viewer.
- Remove a member. Their environment grants are removed with them.
- Any non-owner member can leave a project themselves.

Role changes and removals take effect on the next request and are recorded in the [audit log](/docs/audit-logs).

## Grant or revoke environment access

In **Members & Access**, use the access matrix to grant or revoke each environment for a member or viewer. Revoking takes effect on the next request. Existing CLI sessions are not terminated, but they can no longer read that environment.

Through the API: `PUT` and `DELETE` on `/api/projects/:projectId/environments/:env/access/:userId`. See [Members, access and invitations API](/docs/api/members).

## Troubleshoot permission errors

| You see | Meaning | Fix |
|---|---|---|
| `404 Project not found.` | You are not a member, or the id is wrong. Keel does not distinguish the two. | Check the project id and that you were invited. |
| `403 You do not have permission to do this.` | Your role lacks the permission. | Ask an admin to change your role if you need it. |
| `403 You do not have access to this environment.` | Role is fine, but no grant for this environment. | Ask an admin to grant the environment. Recorded as `environment.access_denied`. |
| `404 Environment not found.` | The project does not have that environment. | Environments are fixed at creation. |
| `403 CLI credentials cannot be used for this operation.` | The action is dashboard-only. | Do it in the dashboard. |

More in [Troubleshooting](/docs/troubleshooting).
