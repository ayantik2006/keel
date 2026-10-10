# Vercel integration

Keeps Vercel environment variables in step with Keel secrets. Status: built and
tested against a **mocked** Vercel API. It has not been verified against a real
Vercel account.

## Setup

1. In Vercel, create an access token (Account Settings, Tokens). For team
   projects, note the team ID (`team_...`, Team Settings).
2. Optional: in the Vercel project, Settings, Git, Deploy Hooks, create a hook
   for the branch you want to redeploy. Copy the URL.
3. In Keel: **Integrations** in the sidebar, pick the project, then the **Vercel**
   section (owners and admins). Paste the token (and team ID), Connect. Then **Choose project**,
   set the mapping, conflict policy, deploy hook and automatic redeploy, Save.
4. **Sync now** to push existing secrets, or **Sync & Redeploy**.

No new environment variables are required. The token and deploy hook are
encrypted with the existing `SECRETS_ENCRYPTION_KEY`.

## Behaviour

- Default mapping: Development to development, Staging to preview, Production to
  production. Any environment can be mapped to any target or left out; two
  environments cannot share a target.
- Creates, updates and deletes (including renames) are pushed after a short
  debounce (3 s, max 15 s), so bursts of changes become one sync.
- Variables are created as Vercel `encrypted` variables with exactly one target.
- A sync reconciles the whole environment, so it is idempotent. A variable
  deleted in Vercel is recreated.
- **Ownership and conflicts:** Keel only changes or deletes variables it created
  or took over (recorded in `integration_vars`). A same-named variable it does
  not own is a *conflict*: left untouched and listed in the UI (policy
  "skip", the default). Under "overwrite" Keel takes over a variable only if it
  targets exactly the mapped target; variables shared with other targets are
  never overwritten.
- Disconnecting, or unmapping an environment, leaves variables in Vercel; Keel
  just stops managing them.
- Changing Vercel variables does not affect a deployment that is already
  running. A new deployment is required.

## Redeploys

Uses a Vercel **deploy hook** (a URL, kept encrypted, validated to be on
`api.vercel.com`). A redeploy is triggered only after a sync that fully
succeeded (no failures, no conflicts) and changed something, at most once per
sync run. "Sync & Redeploy" forces one even with no changes. The deployment is
located afterwards via the deployments API to show its state and URL. A hook
deploys one Git branch.

## Reliability model and limits

There is no job queue in this codebase. Syncs run in the server process:

- A database lease prevents overlapping syncs per integration; a change that
  arrives mid-run triggers another pass; a concurrent manual sync returns 409.
- The debounce timer lives in memory. If the process restarts before it fires,
  the pending change is not lost (the environment is recorded as pending) but it
  is only picked up by the next change or a manual **Sync now**.
- On serverless platforms where the process may be frozen after a response,
  background syncs are unreliable. Use a queue or cron in that case.
- Transient errors (network, 5xx, 429) are retried up to 3 times with backoff.
  401/403/404/400 are not retried; 401/403 mark the integration "needs
  attention" and stop automatic syncing.
- Secret values, the token and the hook are never logged, audited, or returned.
  Error messages shown in the UI are fixed strings, not Vercel response bodies.
- Variable values cannot be read back from Vercel, so drift is detected by the
  secret's version number, not by comparing values. A value changed by hand in
  Vercel is not noticed until the Keel secret changes again.
