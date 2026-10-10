---
title: Environments
description: How Keel separates development, staging and production values, who can access each, and how to avoid using production credentials by mistake.
updated: 2026-10-11
---

An environment is an isolated set of secrets inside a project. Keel offers three: `development`, `staging` and `production`.

## What is supported

- The three environments above, identified by the slugs `development`, `staging` and `production`.
- Choosing which ones a project has when you create it.
- Different values for the same key in each environment.
- Per-person access to each environment.

Not supported today: custom environment names, adding an environment to an existing project, copying secrets between environments, and removing an environment. Plan the set when you [create the project](/docs/first-project).

## Different values per environment

Secrets are unique by key within an environment, so `DATABASE_URL` can exist once in each. Nothing links them: changing one never changes another.

```text
Web App
  development  DATABASE_URL = postgres://...localhost.../app_dev
  staging      DATABASE_URL = postgres://...staging-host.../app_staging
  production   DATABASE_URL = postgres://...prod-host.../app
```

To keep environments aligned, use the same key names everywhere and compare the key lists with `keel secrets list --env <slug>`.

## Choosing the right environment

In the dashboard, the environment picker at the top of **Secrets** decides where Add, Edit and Delete apply. Check it before you save.

In the CLI, the environment comes from `.keel.json`, set by `keel init`. Override it for one command with `--env`:

```bash
keel secrets list --env staging
keel run --env staging -- npm run dev
```

## Access to environments

Access is separate from role:

- **Owners and admins** can use every environment of a project.
- **Members and viewers** can use only environments they were explicitly granted. Without a grant the environment is hidden from them and the API answers `403`.

A grant never raises a role. A viewer granted Production can still only read. Production has no special treatment: every environment is denied by default for members and viewers.

Admins grant access in **Settings**, **Members & Access**. See [Projects and access control](/docs/access-control).

## Avoiding production credentials in development

- Use different credentials per environment, not the same ones with different names. A development database user should not be able to reach production data.
- Do not grant Production to people who only need Development. Most developers need only Development.
- Be deliberate with `--env production`. A plain `keel run` uses the environment pinned in `.keel.json`, so keep that file on `development` for everyday work.
- Check what you are about to run against. `keel run` prints the project and environment it injected from, such as `Injecting 4 secrets from Web App / development`.
- Review the [audit log](/docs/audit-logs) for `secrets.exported` events with `environment: production` and `via: cli`. Each `keel run` against production produces one.

:::security
Anyone who can run `keel run --env production` gets the production values in that process. Treat that command as you would a production shell.
:::

## Next steps

Read [Version history and rollback](/docs/version-history).
