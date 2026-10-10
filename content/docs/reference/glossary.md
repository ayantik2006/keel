---
title: Glossary
description: Short definitions of the terms Keel uses, from projects and environments to device codes and audit events.
updated: 2026-10-11
---

Definitions of the terms used across the Keel documentation and dashboard, in alphabetical order.

## Access grant

Permission for a member or viewer to use one environment. Without a grant they cannot see it. Owners and admins do not need grants. See [Projects and access control](/docs/access-control).

## Access token

A short-lived CLI credential beginning `keel_at_`. It is valid for one hour and is sent as a bearer token.

## Audit log

An append-only record of security-relevant actions in a project, readable by owners and admins. See [Audit logs](/docs/audit-logs).

## Baseline version

The version record Keel creates for a secret that existed before history was introduced. It has no author.

## CLI session

The server-side record behind a CLI login, created when a person approves a device code. It can be revoked at any time.

## Deploy hook

A Vercel URL that triggers a deployment of one Git branch. Keel stores it encrypted and calls it for redeploys.

## Device code and user code

The pair used to sign the CLI in. The device code stays in the CLI. The user code, such as `ABCD-2345`, is shown to you to approve in the browser.

## Environment

An isolated set of secrets in a project: `development`, `staging` or `production`. See [Environments](/docs/environments).

## Environment slug

The identifier of an environment in URLs and `.keel.json`, for example `staging`.

## Injection

Starting a process with secrets in its environment variables, as `keel run` does. See [Runtime secret injection](/docs/cli/run).

## Integration

A connection that pushes Keel secrets to another system. Vercel is the only one today. See [Integrations](/docs/integrations).

## Invitation

A single-use, seven-day link that adds someone to a project with a role and optional environments.

## Key

The name of a secret, such as `DATABASE_URL`. Unique within an environment.

## Member

Either a person belonging to a project, or the specific role `member` that can read and write secrets in granted environments.

## Owner

The person who created a project. One per project. The only one who can delete it.

## Project

The top-level container for secrets, members, environments, integrations and history.

## Refresh token

A single-use CLI credential beginning `keel_rt_`, valid for 30 days. It is exchanged for a new access and refresh token pair.

## Reveal

Fetching and decrypting one secret value on request. Audited as `secret.revealed`.

## Rollback or restore

Writing an earlier version's value as a new version. See [Version history](/docs/version-history).

## Role

A member's project-wide permission set: `owner`, `admin`, `member` or `viewer`.

## Secret

A key and an encrypted value in one environment.

## Version

A numbered, immutable record of a secret's value. Each change to the value creates the next number.

## Viewer

A role that can read but not change secrets, in granted environments.
