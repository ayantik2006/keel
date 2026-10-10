---
title: Security model
description: How Keel encrypts, authenticates, authorizes and audits access to secrets, what the server and client each see, and where the current limits are.
updated: 2026-10-11
---

This page describes what Keel's code does today. It is not a certification or an audit, and it states limits as plainly as protections.

## Where each thing happens

Keel is a server-side system. Plaintext secret values exist in these places:

| Place | When |
|---|---|
| Your browser | After you reveal or copy a value, until you hide it or leave the page |
| The Keel server's memory | While serving a request that reveals, exports or syncs values |
| A CLI process and the processes it starts | For the duration of `keel run`, or after `keel secrets list --reveal` |
| A synced target such as Vercel | After a sync, under that system's own protections |

The database stores ciphertext, never plaintext values.

## Encryption at rest

- Values are encrypted with AES-256-GCM using Node's `node:crypto`.
- Each encryption uses a fresh random 96-bit nonce and produces a 128-bit authentication tag.
- The secret's id is bound to the ciphertext as additional authenticated data, so a payload copied onto another record fails authentication.
- Every historical version is encrypted the same way.
- Vercel access tokens and deploy hooks are encrypted with the same mechanism.
- The key is a 32-byte random value held in the server environment variable `SECRETS_ENCRYPTION_KEY`. It is not stored in the database. The server refuses to start if it is missing or malformed.
- Decryption fails closed. A bad tag, tampering or the wrong key produces an error, never partial data.

:::security
Encryption protects the database at rest. Anyone who holds both the database and the encryption key, or who can run code on the server, can read every secret. Keel is not end-to-end encrypted and the server is trusted.
:::

## Authentication

- **Dashboard:** sign-in, passwords and sessions are managed by Clerk. Which sign-in methods and multi-factor options are available depends on how Clerk is configured for the deployment.
- **CLI:** a device authorization flow. You approve a code in the browser, and the CLI receives a 1 hour access token and a 30 day single-use refresh token. Tokens are stored on the server only as SHA-256 hashes. Reusing a rotated refresh token revokes the session.
- Passwords are never handled by the CLI.

## Authorization

Every project-scoped request is checked in this order, before anything is decrypted:

1. Membership. A non-member gets `404`, so ids cannot be probed.
2. Role permission. Owner, admin, member and viewer map to fixed permissions. See [Projects and access control](/docs/access-control).
3. Environment access. Owners and admins have it implicitly. Members and viewers need an explicit grant, including for production.

The effective permission is the role permission AND the environment access. A grant never raises a role. A CLI token additionally reaches only a short list of endpoints.

## Secret masking

- Secret lists carry key, version and timestamps, never values.
- A value is fetched one secret at a time on request, or in bulk through an environment export.
- The dashboard keeps values masked until you reveal them.
- Every value read is audited, with the key and environment but not the value.

## Role-based access

The `viewer` role can read values in environments it has been granted. If a person must not see values at all, do not give them an environment grant.

## Audit logging

Security-relevant actions are written to an append-only log with the actor, target and non-sensitive metadata. Metadata never holds values, invitation tokens or hashes. See [Audit logs](/docs/audit-logs).

## Transport security

The application does not terminate TLS. Serve it over HTTPS through your hosting or reverse proxy. The CLI refuses non-HTTPS API URLs except for `localhost`, `127.0.0.1` and `[::1]`. Secret-bearing responses are sent with `Cache-Control: no-store`.

## Server-side handling

- Request bodies and error messages are never logged. Unexpected errors log only the error type.
- Rate limits protect login, token refresh, export and import.
- Authentication-related and API routes are marked `noindex`.

## Current limitations

- **No key rotation tooling.** The key-version scheme exists, but re-encrypting existing data under a new key is not implemented. New writes always use key version 1.
- **No external KMS or HSM.** The key lives in a server environment variable.
- **No machine identities.** There are no service tokens or API keys for CI. The CLI session is created by a person.
- **Rate limiting is per instance and in memory.** It resets on restart and multiplies across instances.
- **Invitations are not emailed.** In production the link is not returned either.
- **No ownership transfer.** The creator stays the owner.
- **No custom roles.** The four roles and their permissions are fixed.
- **No secret expiry or automatic rotation.**
- **Audit log is not tamper-evident or exportable.** It is a database collection. There is no external export.
- **Integrations are one way.** Vercel is the only one, and it has been tested only against a mocked API.
- **Runtime injection is not a vault.** Child processes and same-user processes can read injected variables. See [Runtime secret injection](/docs/cli/run#what-it-does-not-protect-against).
- **CLI platform coverage.** Tested on Windows. macOS and Linux code paths are untested, and credentials there rely on file permissions rather than a keychain.

## Reporting a vulnerability

Use the [contact page](/contact) and describe the issue without including live credentials.

## Next steps

Apply these in [Environment variable best practices](/docs/security/best-practices).
