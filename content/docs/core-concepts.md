---
title: Core concepts
description: The projects, environments, secrets, versions, roles, integrations and audit logs Keel is built from, and how they relate.
updated: 2026-10-11
---

This page defines the building blocks of Keel and how they fit together. Each concept links to the guide that covers it in depth.

## How the concepts relate

```text
Project
  |- Members (each has a role)
  |- Environments: development, staging, production
  |    |- Secrets (key + encrypted value)
  |    |    |- Versions (history of values)
  |    |- Access grants (which members can use this environment)
  |- Integrations (Vercel)
  |- Audit log
```

A person can belong to many projects with a different role in each. A secret belongs to exactly one environment of one project.

## Projects

A project is the top-level container, usually one per application. It has a name (up to 60 characters, unique among the projects you own), an optional description (up to 280 characters), its members, its environments and everything inside them. See [Your first project](/docs/first-project).

## Environments

An environment is a separate set of secrets inside a project. Keel supports three: `development`, `staging` and `production`. You choose which ones a project has when you create it. The same key, such as `DATABASE_URL`, can hold a different value in each. See [Environments](/docs/environments).

## Secrets and environment variables

A secret is a key and a value. Keys use letters, numbers and underscores, cannot start with a number, and are at most 128 characters, so they work as environment variable names. Values can be up to 10,000 characters and may contain special characters and line breaks. Values are encrypted before they are stored. See [Managing secrets](/docs/managing-secrets).

## Secret versions and rollback

Every change to a secret's value creates a new version. Earlier values are kept, so you can inspect them and restore one. Restoring creates a new version rather than rewriting history. See [Version history and rollback](/docs/version-history).

## Users and roles

Each project member has one role:

| Role | Summary |
|---|---|
| `owner` | Everything, including deleting the project. One per project. |
| `admin` | Manages members, environment access, integrations, and can read the audit log. |
| `member` | Reads and writes secrets in environments they have been granted. |
| `viewer` | Reads secrets in environments they have been granted. Cannot change anything. |

Owners and admins can use every environment. Members and viewers need an explicit grant per environment. See [Projects and access control](/docs/access-control).

## Integrations

An integration pushes secrets from a Keel environment to another system. Vercel is the only integration implemented today. See [Integrations](/docs/integrations).

## Audit logs

Keel records security-relevant events for each project, such as secret changes, value reveals, role changes and denied access attempts. Secret values are never recorded. Owners and admins can read the log. See [Audit logs](/docs/audit-logs).

## Sessions and the CLI

The dashboard uses a browser session. The CLI uses its own short-lived credentials, issued after you approve a code in the browser. A CLI credential can only reach the small set of endpoints the CLI needs. See [CLI authentication](/docs/cli/authentication).

## Next steps

Put these concepts to work in the [Quickstart](/docs/quickstart).
