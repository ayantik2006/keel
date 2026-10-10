---
title: Your first project
description: How to create a Keel project, name it, choose environments, and set it up sensibly from the start.
updated: 2026-10-11
---

A project holds the secrets, members, integrations and audit history for one application. This page covers creating one and the decisions worth making early.

## Prerequisites

You are signed in to the dashboard. See the [Quickstart](/docs/quickstart) if you do not have an account yet.

## Create a project

1. Open **Projects** in the dashboard sidebar.
2. Choose **Create Project**.
3. Fill in the form:
   - **Name**: required, up to 60 characters. Names are unique among the projects you own, ignoring case.
   - **Description**: optional, up to 280 characters.
   - **Environments**: at least one of Development, Staging and Production. All three are selected by default.
4. Submit.

You become the project's `owner`. The new project appears in the list with an environment count and a secret count per environment.

Through the API this is `POST /api/projects`. See [Projects and environments API](/docs/api/projects).

## Naming

Name projects after the application, not the team or the date. `Web App` or `Billing API` is better than `Q4 Launch`. You can rename a project later from **Settings**, and renaming does not change its id, so the CLI keeps working.

## Choose environments deliberately

Environments cannot be added or removed after creation. Pick the set you expect to use:

| If you have | Select |
|---|---|
| Only local development so far | Development, and plan to recreate or migrate later |
| A staging deploy before production | Development, Staging, Production |
| A single production deploy | Development, Production |

Creating all three costs nothing. An unused environment holds no secrets and, for members and viewers, is invisible until granted.

## Recommended initial setup

1. Create the project with all three environments.
2. Add your development secrets first, using non-production credentials.
3. Invite teammates and grant them **Development** only. See [Projects and access control](/docs/access-control).
4. Add staging and production secrets, and leave those environments to owners and admins until someone needs them.
5. Run `keel init` in the application repository and add `.keel.json` to `.gitignore`.

:::security
Do not copy production credentials into Development to get started. Use separate credentials per environment. See [Environment variable best practices](/docs/security/best-practices).
:::

## Organize secrets

Environments are the only grouping Keel offers, and there are no folders. Use clear, consistent key names:

- Use the names your application already reads, such as `DATABASE_URL`.
- Prefix by service when keys might collide, such as `STRIPE_SECRET_KEY`.
- Keep the same key set across environments so a missing key is easy to spot.

## Delete a project

Only the owner can delete a project, from **Settings**. Deletion removes its secrets, version history, members, invitations, environment access and integrations. Audit records are kept. This cannot be undone.

## Next steps

Add your first secret in [Your first secret](/docs/first-secret).
