---
title: API overview
description: Base URL, authentication, request and response conventions, rate limits and the authorization model of the Keel HTTP API.
updated: 2026-10-11
---

The Keel dashboard and the CLI both use one HTTP API. This reference documents the endpoints as implemented in the application. There is no versioned public API yet, so paths and shapes can change between releases.

:::note
A machine-readable OpenAPI document is not provided. This reference is maintained by hand, and the project's tests check that every route in the application appears in it. If you need a stable integration surface, plan for change.
:::

## Base URL

Every path starts with `/api` on your Keel origin:

```text
https://keel.example.com/api
```

For local development this is `http://localhost:3000/api`. In the examples, `$KEEL_URL` is your origin and `$KEEL_ACCESS_TOKEN` is a CLI access token.

## Authentication

There are two ways to authenticate, and each endpoint accepts one or both:

| Method | How | Where it works |
|---|---|---|
| Browser session | A Clerk session cookie, sent automatically by the dashboard | Every endpoint that needs a user |
| CLI bearer token | `Authorization: Bearer keel_at_...` | Only endpoints marked **CLI** below |

Any request with a `keel_` bearer token on an endpoint that does not accept CLI credentials gets `403 CLI credentials cannot be used for this operation.` An invalid or expired CLI token gets `401` and never falls back to cookies.

There are no personal access tokens, API keys or service accounts. A CLI session is the only non-browser credential, and it is created by a person approving a device code. See [Authentication endpoints](/docs/api/authentication).

## Content types

- Requests with a body must send `Content-Type: application/json` and a JSON object. Otherwise the API answers `415` or `400`.
- Responses are JSON with `Cache-Control: no-store`.
- The one exception is a `.env` export, which is `text/plain`.

## Response conventions

- Successful responses wrap data in a named key, such as `{ "project": { ... } }` or `{ "secrets": [ ... ] }`.
- Actions without data return `{ "ok": true }`.
- Timestamps are ISO 8601 strings in UTC.
- Errors use `{ "error": "message" }`. See [Error codes](/docs/api/errors).
- Secret values appear only in the responses that are documented to return them. Lists contain metadata only.

## Authorization model

Project-scoped endpoints apply three checks in order:

1. **Membership.** You must be a member of the project. If not, the API answers `404 Project not found.`, the same as for an id that does not exist.
2. **Permission.** Your role must hold the required permission, or the API answers `403`. See [Projects and access control](/docs/access-control#roles-and-permissions).
3. **Environment access.** For environment endpoints, owners and admins pass. Members and viewers need a grant, or the API answers `403 You do not have access to this environment.`

All of this runs before any secret is read or decrypted.

## Rate limits

Limits are fixed windows of one minute, counted in server memory per instance. Exceeding one returns `429` with `Too many requests. Try again in Ns.`

| Operation | Limit | Key |
|---|---|---|
| `POST /api/cli/auth/device` | 10 | client IP |
| `POST /api/cli/auth/token` | 60 | client IP |
| `POST /api/cli/auth/refresh` | 30 | client IP |
| `POST /api/cli/auth/approve` | 10 | user |
| `GET .../export` | 30 | user |
| `POST .../import` | 10 | user |
| Vercel connect, options, sync | 10, 20, 6 | user |

Other endpoints are not rate limited by the application. Because counters are per instance, a multi-instance deployment multiplies these limits.

## CORS

No CORS headers are configured. The API is intended for same-origin use by the dashboard and for non-browser clients such as the CLI.

## Endpoint index

| Method and path | Access | Page |
|---|---|---|
| `POST /api/cli/auth/device` | public | [Authentication](/docs/api/authentication) |
| `POST /api/cli/auth/token` | public | [Authentication](/docs/api/authentication) |
| `POST /api/cli/auth/refresh` | refresh token | [Authentication](/docs/api/authentication) |
| `POST /api/cli/auth/logout` | CLI | [Authentication](/docs/api/authentication) |
| `POST /api/cli/auth/approve` | browser | [Authentication](/docs/api/authentication) |
| `GET`, `DELETE /api/cli/sessions` | browser | [Authentication](/docs/api/authentication) |
| `DELETE /api/cli/sessions/:sessionId` | browser | [Authentication](/docs/api/authentication) |
| `GET /api/projects` | CLI, browser | [Projects](/docs/api/projects) |
| `POST /api/projects` | browser | [Projects](/docs/api/projects) |
| `GET /api/projects/:projectId` | CLI, browser | [Projects](/docs/api/projects) |
| `PATCH`, `DELETE /api/projects/:projectId` | browser | [Projects](/docs/api/projects) |
| `GET`, `POST .../environments/:env/secrets` | CLI, browser | [Secrets](/docs/api/secrets) |
| `GET`, `PATCH .../secrets/:secretId` | CLI, browser | [Secrets](/docs/api/secrets) |
| `DELETE .../secrets/:secretId` | browser | [Secrets](/docs/api/secrets) |
| `GET .../secrets/:secretId/versions` and `/:n` | browser | [Secrets](/docs/api/secrets) |
| `POST .../versions/:n/restore` | browser | [Secrets](/docs/api/secrets) |
| `GET .../environments/:env/export` | CLI, browser | [Secrets](/docs/api/secrets) |
| `POST .../environments/:env/import` | browser | [Secrets](/docs/api/secrets) |
| Members, invitations, environment access | browser | [Members and access](/docs/api/members) |
| `GET .../audit`, `GET .../security` | browser | [Audit](/docs/api/audit) |
| Vercel integration | browser | [Audit and integrations](/docs/api/audit) |

## Next steps

Start with [Authentication endpoints](/docs/api/authentication).
