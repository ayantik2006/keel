---
title: FAQ
description: Answers to common questions about what Keel is, how it protects secrets, how environments and rollback work, and what happens if Keel is unavailable.
updated: 2026-10-11
---

Short answers to the questions people ask most, each linking to the page with the full explanation.

## What is Keel?

Keel is a secrets manager for application teams. It stores environment variables encrypted, separates them by environment, controls who can read them, keeps version history, and records an audit log. See the [Introduction](/docs/introduction).

## How is Keel different from a `.env` file?

A `.env` file is plaintext on every machine that holds a copy, with no history and no access control. Keel keeps one encrypted source of truth, checks who may read each environment, records changes and reads, and lets you run commands with secrets injected instead of writing a file. See the table in the [Introduction](/docs/introduction#what-makes-it-different-from-a-env-file).

## How are secrets protected?

Values are encrypted at rest with AES-256-GCM using a key held in the server environment. Lists never contain values, access is checked by role and environment before decryption, and every read is audited. Keel's server is trusted and it is not end-to-end encrypted. Read the [Security model](/docs/security/model) for the full picture and the limits.

## Can different environments use different values?

Yes. The same key can exist in development, staging and production with unrelated values. See [Environments](/docs/environments).

## How does rollback work?

Restoring a version writes that old value as a new version. History is never rewritten. Applications need a restart or redeploy to see it. See [Version history and rollback](/docs/version-history).

## How do I use Keel in a local application?

Build the CLI, log in, run `keel init` in your app directory, then start your app with `keel run -- <command>`. The [Quickstart](/docs/quickstart) walks through it.

## What happens when a secret changes?

A new version is created, an audit event is recorded, and, if the Vercel integration is active, the change is synced to Vercel shortly afterwards. Running applications do not see the change until they restart. Local `keel run` sessions pick it up on the next run.

## What integrations are supported?

Vercel, one way from Keel to Vercel. It has been tested against a mocked Vercel API and has not yet been verified against a live account. See [Integrations](/docs/integrations).

## What happens if Keel is unavailable?

Running applications keep the variables they already started with. New `keel run` commands cannot start, because there is no offline cache of secrets. Dashboard access and Vercel syncs resume when the service returns. Deployments that already hold synced variables in Vercel are unaffected.

## Can I use Keel in CI?

Not cleanly today. There are no service tokens or API keys. A CLI session is created by a person approving a code in a browser. Use the [Vercel integration](/docs/integrations/vercel) to deliver variables to deployments instead.

## Is the CLI available on npm?

No. It is built from the repository. See [CLI installation](/docs/cli/installation).

## Can I delete a secret from the CLI?

No. Deletion is dashboard-only on purpose, and it also removes the secret's history.

## Can I add a fourth environment?

No. The three environments are fixed, and a project's set is chosen when it is created.

## Who can see the audit log?

Owners and admins. See [Audit logs](/docs/audit-logs).

## Where do I report a problem?

Use the [contact page](/contact), and see [Troubleshooting](/docs/troubleshooting) first.
