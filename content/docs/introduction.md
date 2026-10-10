---
title: Introduction
description: What Keel is, the problem it solves, who it is for, and how it fits into a developer's workflow.
updated: 2026-10-11
---

Keel is a secrets manager for application teams. You store API keys, database URLs and other environment variables in Keel once, keep different values for each environment, decide who can read them, and keep a history of every change.

## The problem Keel solves

Most projects start with a `.env` file. That works for one developer on one machine, then it starts to break down:

- The file is copied into chat messages and email to onboard a teammate.
- Nobody knows which copy is current, or which value production actually uses.
- A leaked file exposes every credential at once, and there is no record of who had it.
- Removing someone's access means rotating everything, because you cannot tell what they saw.

Keel replaces the file with a central, access-controlled store. The values live encrypted on the Keel server, and applications receive them only when an authorized person or CLI session asks for them.

## What makes it different from a `.env` file

| | `.env` file | Keel |
|---|---|---|
| Where values live | Plain text on every machine that has a copy | Encrypted on the server, one source of truth |
| Who can read them | Anyone with the file | Project members with the right role and environment access |
| Changes | Silent, no history | Versioned, with the previous value kept and restorable |
| Accountability | None | Audit log of reads, changes and access decisions |
| Onboarding | Send the file | Invite the person, grant an environment |

Keel does not remove the need to treat secrets carefully. See [Security model](/docs/security/model) for what it protects and what it does not.

## Who should use it

Keel fits small and mid-sized teams that deploy web applications and want to stop passing `.env` files around. It is a good match if you:

- Run separate development, staging and production environments.
- Want teammates to read some environments but not others.
- Deploy to Vercel and want variables kept in step with a single source.

It is not yet a good match if you need machine identities for CI pipelines, a hosted key management service, or compliance certifications. Those are not part of the current implementation. See [Security model](/docs/security/model#current-limitations).

## How Keel fits into your workflow

1. A project owner creates a **project** and its **environments** in the dashboard.
2. Team members add **secrets** to each environment and are granted access to the environments they need.
3. Developers run their application locally with `keel run`, which injects the secrets into the process environment without writing a file.
4. Optionally, the [Vercel integration](/docs/integrations/vercel) keeps your deployment's environment variables in step.
5. Owners and admins review the [audit log](/docs/audit-logs) when something changes unexpectedly.

## What is in the product

- **Dashboard** at `/dashboard`: projects, secrets, integrations and settings.
- **Secrets** with masked values, version history and rollback.
- **Environments**: Development, Staging and Production.
- **Roles**: owner, admin, member and viewer, plus per-environment access.
- **Audit log** for owners and admins.
- **CLI** for signing in, choosing a project, setting secrets and running commands with secrets injected.
- **Vercel integration** for pushing secrets to a Vercel project.
- **HTTP API** used by the dashboard and the CLI. See [API overview](/docs/api/overview).

:::note
The CLI is not published to a package registry yet. You build it from the repository. See [CLI installation](/docs/cli/installation).
:::

## Next steps

Continue with [Core concepts](/docs/core-concepts), or go straight to the [Quickstart](/docs/quickstart).
