---
title: Environment variable best practices
description: Practical rules for handling secrets with Keel, from keeping them out of Git to rotating compromised credentials and restricting access.
updated: 2026-10-11
---

Keel gives you a safer place to keep secrets. These practices keep them safe once they leave it.

## Never commit real secrets to Git

- Add `.env`, `.env.*` and `.keel.json` to `.gitignore`. `.keel.json` holds no secrets but is personal to you.
- Commit a `.env.example` with names and fake values so teammates know what to set.
- Add a secret scanner to your repository or CI. Keel's own tokens are prefixed `keel_at_` and `keel_rt_` to be easy to detect.
- If a secret reaches Git history, treat it as compromised even after you delete the commit. Rotate it.

```gitignore
.env
.env.*
!.env.example
.keel.json
```

## Use separate credentials per environment

Create distinct credentials for development, staging and production at their source, such as a separate database user or API key for each. Store each in the matching [Keel environment](/docs/environments). A leak of a development key then cannot touch production.

## Restrict access

- Give people the lowest role that lets them work. Most developers need `member`, not `admin`.
- Grant only the environments they use. Production is denied by default for members and viewers. Keep it that way.
- Remember that `viewer` can still read values in granted environments.
- Review the member list and the [access matrix](/docs/access-control#grant-or-revoke-environment-access) regularly, and remove people who have moved on.

## Keep secrets out of logs and errors

- Never print `process.env` or whole config objects.
- Log whether a variable is set, not its value.
- Check that your error reporter and request logger scrub values and headers.
- Do not echo secrets in CI output. Mask them in your CI provider.

## Handle `.env` files carefully

- Prefer `keel run` to exported files. See [Runtime secret injection](/docs/cli/run).
- If you must export, write the file outside the repository, restrict its permissions, and delete it afterwards.
- Do not attach `.env` files to tickets or messages.
- Remember that an export is audited as `secrets.exported`.

## Rotate compromised credentials

1. Revoke or rotate the credential at its source first, so the leaked value stops working.
2. Update the value in Keel. This creates a new [version](/docs/version-history).
3. Redeploy or restart applications so they read the new value. With [Vercel](/docs/integrations/vercel), a new deployment is required.
4. Check the [audit log](/docs/audit-logs) for `secret.revealed` and `secrets.exported` events to see who could have had it.
5. Do not use rollback to return to a compromised value.

## Manage deployment credentials safely

- Keep the Vercel access token scoped to the team and projects you need, and rotate it periodically.
- Use a deploy hook for one branch only.
- Treat the Keel server's `SECRETS_ENCRYPTION_KEY`, `CLERK_SECRET_KEY` and `MONGODB_URI` as your most sensitive values. Keep them in your hosting provider's secret store, not in the repository.
- Back up `SECRETS_ENCRYPTION_KEY` separately from the database backups. Without it the data cannot be decrypted.

## Next steps

Fix problems with [Troubleshooting](/docs/troubleshooting).
