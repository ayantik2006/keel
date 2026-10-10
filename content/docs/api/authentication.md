---
title: Authentication endpoints
description: The device authorization flow and CLI session endpoints used to sign the Keel CLI in, refresh its tokens and revoke sessions.
updated: 2026-10-11
---

Browser sign-in is handled by Clerk and is not part of this API. The endpoints here implement the device authorization flow used by the CLI. See [CLI authentication](/docs/cli/authentication) for the user-facing view.

## The flow

```text
CLI                         Keel                       Browser (signed in)
 | POST /device ------------>|                                |
 |<-- deviceCode, userCode --|                                |
 |        (shows link + code)                                 |
 |                           |<-- POST /approve (userCode) ---|
 | POST /token (poll) ------>|                                |
 |<-- 202 pending            |                                |
 | POST /token ------------->|                                |
 |<-- 200 tokens (once)      |                                |
```

Device requests expire after 10 minutes. Polling should respect the returned `interval` (3 seconds).

### POST /api/cli/auth/device

Starts a login. No authentication. It only creates a pending request that a signed-in user must approve.

Request body:

| Field | Type | Notes |
|---|---|---|
| `deviceName` | string, optional | Shown on the approval page. Sanitized and cut to 60 characters. |

```bash
curl -s -X POST "$KEEL_URL/api/cli/auth/device" \
  -H "Content-Type: application/json" \
  -d '{"deviceName":"laptop (linux)"}'
```

Response `200`:

```json
{
  "deviceCode": "<random-device-code>",
  "userCode": "ABCD-2345",
  "verificationUrl": "https://keel.example.com/cli/authorize?code=ABCD-2345",
  "expiresIn": 600,
  "interval": 3
}
```

Errors: `429` rate limited, `503 Could not start login. Try again.`

### POST /api/cli/auth/token

Polls for the result. No authentication. Credentials are returned exactly once, then the request is consumed.

Request body: `{ "deviceCode": "<device code>" }`

| Status | Body | Meaning |
|---|---|---|
| `202` | `{ "status": "pending" }` | Not approved yet. Poll again. |
| `200` | `{ "status": "approved", ...tokens }` | Approved. Store the tokens. |
| `400` | `{ "status": "denied" }` | The user denied the request. |
| `400` | `{ "status": "expired" }` | Expired or already used. |
| `400` | `{ "error": "Invalid device code." }` | Unknown or malformed code. |
| `429` | `{ "error": "..." }` | Slow down. |

Approved response:

```json
{
  "status": "approved",
  "accessToken": "keel_at_<token>",
  "refreshToken": "keel_rt_<token>",
  "accessExpiresAt": "2026-10-11T10:30:00.000Z",
  "refreshExpiresAt": "2026-11-10T09:30:00.000Z",
  "email": "you@example.com"
}
```

### POST /api/cli/auth/approve

Approves or denies a pending request. Browser session only. A CLI token can never mint another CLI token.

Request body:

| Field | Type | Notes |
|---|---|---|
| `userCode` | string, required | The 8 character code, with or without the dash |
| `approve` | boolean, optional | `false` denies. Anything else approves. |

Response `200`: `{ "ok": true, "approved": true, "deviceName": "laptop (linux)" }`

Errors: `400 Enter the 8 character code from your terminal.`, `401`, `404 That code is invalid or has expired.`, `429`.

### POST /api/cli/auth/refresh

Exchanges a refresh token for a new pair. Refresh tokens are single use.

Request body: `{ "refreshToken": "keel_rt_<token>" }`

Response `200`: the same shape as the approved token response.

Errors: `401 Your CLI session has expired or was revoked. Run keel login.` Presenting a token that was already rotated revokes the whole session.

### POST /api/cli/auth/logout

Revokes the session behind the bearer token. Idempotent: an unknown or expired token still returns `{ "ok": true }`.

```bash
curl -s -X POST "$KEEL_URL/api/cli/auth/logout" \
  -H "Authorization: Bearer $KEEL_ACCESS_TOKEN"
```

## Session management

Browser session only.

### GET /api/cli/sessions

Lists your active CLI sessions. Token material is never included.

```json
{
  "sessions": [
    {
      "id": "3f6c...",
      "deviceName": "laptop (linux)",
      "createdAt": "2026-10-11T09:30:00.000Z",
      "lastUsedAt": "2026-10-11T09:45:12.000Z",
      "expiresAt": "2026-11-10T09:30:00.000Z"
    }
  ]
}
```

### DELETE /api/cli/sessions

Revokes every one of your CLI sessions. Response: `{ "revoked": 2 }`.

### DELETE /api/cli/sessions/:sessionId

Revokes one session. Response `{ "ok": true }`, or `404 Session not found.`

## Security considerations

- Tokens are random, prefixed with `keel_at_` and `keel_rt_` so secret scanners can find them, and stored server-side only as SHA-256 hashes.
- Treat the access token like a password. It can read every secret you can.
- Revoked and expired tokens stop working on the next request.

## Next steps

See [Projects and environments](/docs/api/projects).
