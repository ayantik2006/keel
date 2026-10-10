---
title: Vercel integration
description: Connect a Vercel account, map Keel environments to Vercel targets, sync secrets, redeploy automatically, and handle sync failures.
updated: 2026-10-11
---

The Vercel integration keeps a Vercel project's environment variables in step with a Keel project's secrets.

:::warning
This integration is built and covered by tests against a mocked Vercel API. It has not been verified against a real Vercel account. Try it on a non-critical Vercel project first.
:::

## Prerequisites

- Keel role `owner` or `admin` on the project.
- A Vercel access token, created in Vercel under Account Settings, Tokens.
- For a team project, the team ID, which looks like `team_xxxxxxxx`.
- Optional: a Vercel **deploy hook** for the branch to redeploy, created in the Vercel project under Settings, Git, Deploy Hooks.

## Connect a Vercel account

1. In Keel, open **Integrations** and select your project.
2. In the **Vercel** section paste the **Access token** and, for a team, the **Team ID**.
3. Choose **Connect Vercel**.

Keel verifies the token with Vercel before saving it. It is stored encrypted and is never shown again.

## Select a Vercel project and map environments

1. Choose **Choose project** and pick the Vercel project from the list.
2. Set the mapping from each Keel environment to a Vercel target:

| Keel environment | Default Vercel target |
|---|---|
| development | development |
| staging | preview |
| production | production |

You can map any environment to any target or leave one out, but two Keel environments cannot share a target, because their variables would collide.

3. Under **When a variable already exists in Vercel**, choose the conflict policy:
   - `skip` (default, shown as "Leave it alone and report a conflict"): a variable with the same name that Keel did not create is left alone and reported as a conflict.
   - `overwrite`: Keel takes over such a variable only if it targets exactly the mapped target. Variables shared with other targets are never overwritten.
4. Optionally paste the **Deploy hook URL** and enable **Redeploy automatically**. The hook must be on `api.vercel.com`, and automatic redeploy is refused without one.
5. Save.

## Synchronize secrets

- **Automatic:** creating, updating, renaming and deleting secrets are pushed after a short delay (3 seconds, up to 15), so a burst of changes becomes one sync.
- **Manual:** choose **Sync now** to reconcile everything, for example the first time. Manual sync is limited to 6 per minute per user.

Variables are created in Vercel as `encrypted` variables with exactly one target. A sync reconciles the whole environment, so it is safe to repeat, and a variable removed by hand in Vercel is recreated.

Keel only edits or deletes variables it created or took over. It tracks them itself, so unrelated Vercel variables are never touched.

## Deployments and redeploys

Changing an environment variable in Vercel does not alter a deployment that is already running. A new deployment is required for the change to take effect. That is a Vercel behavior, and it applies to Keel's changes too.

With a deploy hook configured:

- **Redeploy automatically** triggers the hook after a sync that fully succeeded and changed something, at most once per sync run.
- **Sync & redeploy** forces a sync and a redeploy, even if nothing changed.

A deploy hook deploys one Git branch. Keel then looks up the deployment through Vercel's API to show its state and URL.

## Sync failures and retries

| Situation | Behavior |
|---|---|
| Network error, 5xx, 429 | Retried up to 3 times with backoff |
| 400, 404 | Not retried. The error is shown. |
| 401, 403 | Integration marked as needing attention. Automatic syncing stops until you reconnect. |
| Conflict with an unmanaged variable | Left untouched under `skip` and listed in the dashboard. Redeploy is not triggered. |
| A sync is already running | A manual sync returns `409`. The running sync picks up your change. |

Error messages in the dashboard are fixed strings, not raw Vercel responses, so they cannot echo secret data.

## Limits you should know

- There is no job queue. Syncs run in the server process. The debounce timer is in memory, so if the process restarts the change is remembered as pending but only runs on the next change or a manual **Sync now**.
- On serverless hosting where a process may be frozen after responding, background syncs are unreliable. Use manual sync or add a scheduler.
- Vercel does not return variable values, so Keel detects drift by version number. A value edited by hand in Vercel is not noticed until the Keel secret changes again.
- Disconnecting, or unmapping an environment, leaves existing variables in Vercel.

## Disconnect

Choose **Disconnect** in the Vercel section and confirm. Keel deletes its stored token, hook and ownership records. Variables stay in Vercel and are no longer managed.

## Next steps

If something fails, see [Troubleshooting](/docs/troubleshooting#failed-integration-synchronization).
