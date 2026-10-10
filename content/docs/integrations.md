---
title: Integrations
description: Which integrations Keel supports today, what they need, and how synchronization and disconnection behave.
updated: 2026-10-11
---

An integration pushes secrets from Keel to another system, so your deployment gets the same values without copy and paste.

## Available integrations

| Integration | Status | Direction |
|---|---|---|
| [Vercel](/docs/integrations/vercel) | Implemented. Tested against a mocked Vercel API, not yet verified against a live account. | Keel to Vercel |

No other integrations exist. Environment variable import from other providers, GitHub Actions, AWS and similar are not implemented.

## Where to find them

Open **Integrations** in the dashboard sidebar and select a project. Managing integrations needs the `integrations:manage` permission, which owners and admins have.

## How integrations behave

- **One direction.** Keel is the source of truth. Changes made in the other system are not read back.
- **Credentials are encrypted.** Access tokens and deploy hooks are stored encrypted with the same server key as secret values, and are never returned to the browser.
- **Environment mapping.** You choose which Keel environments sync and where each one goes. Unmapped environments are not synced.
- **Syncing is automatic and manual.** Changes sync shortly after they are made, and you can sync on demand.
- **Everything is audited.** Connecting, updating, syncing, disconnecting and deploy triggers appear in the [audit log](/docs/audit-logs).

## Disconnecting

Disconnect removes Keel's stored credentials and its record of what it manages. It does not delete variables already created in the other system. Keel simply stops managing them.

## Failure behavior

Integrations report their last sync status and last error in the dashboard. Authentication failures mark the integration as needing attention and pause automatic syncing until you reconnect. Details for Vercel are in the [Vercel guide](/docs/integrations/vercel#sync-failures-and-retries).

## Next steps

Set up [Vercel](/docs/integrations/vercel).
