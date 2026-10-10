---
title: Error codes
description: The HTTP status codes and error response shape the Keel API returns, with the messages you will see and what to do about them.
updated: 2026-10-11
---

When a request fails, the Keel API answers with a non-2xx status and a small JSON body. This page lists the statuses it uses, the messages behind them, and how clients should react.

## Error shape

Every error is JSON with a single human-readable message:

```json
{ "error": "You do not have permission to do this." }
```

Messages are safe to show to users. They never contain secret values, tokens or request bodies. Import results use per-entry `error` strings with the same property.

The device token endpoint also returns a `status` field, because polling clients need it:

```json
{ "status": "pending" }
```

## Status codes

| Status | Meaning | Typical messages |
|---|---|---|
| `400` | The request is invalid | `Request body must be valid JSON.`, `Key is required.`, `Nothing to update.`, `Role must be admin, member, or viewer.` |
| `401` | No valid session or token | `You need to sign in.`, `Your CLI session has expired or was revoked. Run keel login.` |
| `403` | Authenticated, but not allowed | `You do not have permission to do this.`, `You do not have access to this environment.`, `CLI credentials cannot be used for this operation.` |
| `404` | Not found, or you cannot see it | `Project not found.`, `Environment not found.`, `Secret not found.`, `Version not found.` |
| `409` | Conflict | `A secret with this key already exists in this environment.`, `This secret was changed by someone else. Reload and try again.`, `A project with this name already exists.` |
| `410` | Gone | `This invitation is invalid, expired, or already used.` |
| `413` | Too large | `The import is too large.` |
| `415` | Wrong content type | `Content-Type must be application/json.` |
| `429` | Rate limited | `Too many requests. Try again in 12s.` |
| `500` | Server error | `Something went wrong. Please try again.`, `This secret could not be decrypted.` |
| `502` | An upstream service failed | A fixed message about Vercel |
| `503` | Temporarily unavailable | `Could not start login. Try again.` |

## Distinguishing 403 and 404

Keel returns `404` for a project you are not a member of, so a caller cannot learn which project ids exist. `403` means you are a member and a role or environment rule blocked the action. See [Troubleshooting](/docs/troubleshooting#permission-denied).

## Decryption failures

If a stored value cannot be decrypted, for example because the server encryption key was changed, the API fails closed with `500`. It does not return partial data. Export fails as a whole, and so does `keel run`. The server logs the secret id but never the payload. See the [environment variables reference](/docs/reference/environment-variables).

## Retrying

- `429`: wait the number of seconds in the message.
- `409` on an update: read the current version, reapply your change, send again.
- `5xx`: safe to retry reads. For writes, check the current state first, because a retried write may have been applied.
- `4xx` otherwise: do not retry without changing the request.

## Next steps

Read the [Security model](/docs/security/model).
