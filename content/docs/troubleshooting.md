---
title: Troubleshooting
description: Diagnose login failures, permission errors, missing projects, CLI configuration problems, network errors, integration sync failures and failed deployments.
updated: 2026-10-11
---

Find your symptom, match the message, apply the fix. Messages are quoted as Keel prints them.

## Login failures

**Dashboard sign-in fails.** Sign-in is handled by Clerk. Reset your password from the sign-in page, or check with whoever configured Clerk for the deployment.

**`keel login` does not open a browser.** Run `keel login --no-browser --api-url <url>` and open the printed link yourself.

**`No API URL. Pass --api-url <url> or set KEEL_API_URL.`** The CLI has no default server. Pass the URL once, or set `KEEL_API_URL`.

**`That code is invalid or has expired.`** The 8 character code lives for 10 minutes and works once. Run `keel login` again and enter the new code.

**`The login request expired.`** You did not approve in time. Start again.

## Invalid credentials

**`You are not logged in. Run keel login.`** There are no stored credentials. Log in.

**`Your session has expired or was revoked. Run keel login.`** The 30 day refresh token expired, the session was revoked, or a rotated refresh token was reused. Log in again.

**`You are logged in to X, but this project uses Y.`** `.keel.json` points to a different server than your credentials. Run `keel login --api-url Y`.

## Missing projects or environments

**`You do not have access to any projects.`** Your account is not a member of any project. Sign in with the account that was invited, and check the invitation was accepted.

**`You have no access to any environment in your projects. Ask a project admin for access.`** You are a member but have no environment grants. An owner or admin must grant at least one.

**An environment is not in the list.** Members and viewers only see environments they were granted. Also, environments are fixed at project creation. See [Environments](/docs/environments).

**`Environment "x" is not available to you in <project>.`** The slug is wrong or not granted. Use `development`, `staging` or `production`.

## Permission denied

| Message | Cause and fix |
|---|---|
| `You do not have permission to do this.` | Your role lacks the permission. An admin can change your role. |
| `You do not have access to this environment.` | You have no grant for that environment. An admin grants it in **Members & Access**. |
| `Project not found.` | You are not a member, or the id is wrong. |
| `CLI credentials cannot be used for this operation.` | The action is dashboard-only. Delete, version history, restore, import, members and audit are not available to the CLI. |

Owners and admins can look for `environment.access_denied` events in the [audit log](/docs/audit-logs).

## Secret not found

**`Secret not found.`** The id is wrong, the secret was deleted, or it is in a different environment. Secret ids are unique to one environment.

**A key is missing in `keel run`.** Run `keel secrets list` and check the environment line. You may be in `development` while the key exists only in `production`. Add the key, or pass `--env`.

**`This secret could not be decrypted.`** The server's `SECRETS_ENCRYPTION_KEY` does not match the one the value was encrypted with. Restore the correct key. See the [environment variables reference](/docs/reference/environment-variables).

## CLI configuration errors

| Message | Fix |
|---|---|
| `No .keel.json found. Run keel init in your project directory.` | Run `keel init` there. |
| `.keel.json is not valid JSON.` | Run `keel init` to recreate it. |
| `Invalid .keel.json: environment is missing or malformed.` | Run `keel init`. Environment must be a lowercase slug. |
| `The API URL must use https.` | Use `https`. Plain `http` works only for `localhost`. |
| `Command not found: <cmd>` | The command is not on your `PATH`. |
| `Provide a command after -- ...` | Add the command: `keel run -- npm run dev`. |

## Network or API failures

**`Could not reach <host>. Check the API URL and your network connection.`** Check the URL, VPN or proxy, and that the server is running.

**`The request to <host> timed out.`** The server did not answer within 30 seconds. Retry, then check server health.

**`Too many requests. Try again in Ns.`** A rate limit was hit. Wait the stated time. See [API overview](/docs/api/overview#rate-limits).

**`Something went wrong. Please try again.`** An unexpected server error. The server logs the error type. If it repeats, check the server logs. Set `KEEL_DEBUG=1` in the CLI to print the error type.

If the Keel server is down, `keel run` cannot start your command. Running applications keep the values they already have.

## Failed integration synchronization

Open **Integrations** and read **Last result** and **Last error** for the project.

| Symptom | Cause and fix |
|---|---|
| Status needs attention | Vercel rejected the token (401 or 403). Create a new token and choose **Connect Vercel** again. |
| `Reconnect Vercel before syncing.` | Same as above. Automatic syncing stops until you reconnect. |
| Conflicts listed | Variables with the same name exist in Vercel and were not created by Keel. Rename them, or switch the policy to overwrite. |
| `A sync is already running.` | Wait. The running sync includes your change. |
| Changes not syncing after a restart | The debounce timer is in memory. Run **Sync now**. |
| `That Vercel project was not found for this token.` | Wrong project or team. Check the team ID. |

More in the [Vercel guide](/docs/integrations/vercel#sync-failures-and-retries).

## Failed deployments

- **The app still uses an old value.** Vercel only applies environment variable changes to new deployments. Redeploy, or use **Sync & redeploy**.
- **A variable is missing in a deployment.** Check the mapping. A Keel `staging` environment mapped to `preview` does not reach production deployments.
- **Redeploy was not triggered.** Automatic redeploy fires only after a sync that fully succeeded and changed something, and only if a deploy hook is set. Conflicts block it.
- **The build fails.** Keel is not part of the build. Read the Vercel build log. If a required variable is absent, see the mapping point above.
- **Wrong branch deployed.** A deploy hook deploys one Git branch. Create a hook for the branch you need.

## Still stuck

Use the [contact page](/contact) and include the exact message and what you ran. Never include secret values or tokens.
