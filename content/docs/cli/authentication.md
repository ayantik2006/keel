---
title: CLI authentication
description: How keel login works, where credentials are stored, how tokens expire and renew, and how to log out or revoke a session.
updated: 2026-10-11
---

The CLI never handles your password. You approve a short code in the browser, and the CLI receives its own revocable credentials.

## Log in

```bash
keel login --api-url https://keel.example.com
```

| Option | Purpose |
|---|---|
| `--api-url <url>` | The Keel server. Alternatively set `KEEL_API_URL`. |
| `--no-browser` | Print the link instead of opening a browser. |

What happens:

1. The CLI asks the server for a device code and prints a link and an 8 character code such as `ABCD-2345`.
2. It opens the link in your browser (unless `--no-browser`).
3. You sign in if needed, check that the code matches the one in your terminal, and approve.
4. The CLI polls every few seconds and, once approved, stores its credentials.

```text
To sign in, open this page and confirm the code:

  https://keel.example.com/cli/authorize?code=ABCD-2345

  Code: ABCD-2345

Waiting for approval... (Ctrl+C to cancel)
Logged in as you@example.com.
```

The request expires after 10 minutes. If you did not start the login, deny it and do not approve unknown codes.

:::security
Only approve a code that you can see in your own terminal. Approving gives that terminal access to every project and environment you can reach, until the session is revoked or expires.
:::

The API URL must use `https`. Plain `http` is accepted only for `localhost`, `127.0.0.1` and `[::1]`, for local development.

## Tokens, expiry and renewal

| Token | Lifetime | Notes |
|---|---|---|
| Access token (`keel_at_...`) | 1 hour | Sent as a bearer token on each request |
| Refresh token (`keel_rt_...`) | 30 days | Single use. It rotates every time it is used. |

Renewal is automatic. When the server answers `401`, the CLI exchanges the refresh token for a new pair, saves it, and retries once. You do not need to do anything until the refresh token expires after 30 days, or the session is revoked.

If a refresh token is presented a second time, the server treats it as possible theft and revokes the whole session.

Tokens are stored on the server only as SHA-256 hashes.

## Where credentials are stored

| Platform | Location | Protection |
|---|---|---|
| Windows | `%APPDATA%\keel-cli\credentials.dpapi` | Encrypted with DPAPI, bound to your Windows user |
| macOS and Linux | `~/.config/keel-cli/credentials.json` | File mode `0600` in a `0700` directory. Not an OS keychain. |

Set `KEEL_CONFIG_DIR` to use another directory. Set `KEEL_CREDENTIAL_STORE=file` to force the file store. If Windows protection cannot be used, the CLI warns and falls back to a user-only file.

## Log out

```bash
keel logout
```

This revokes the machine's session on the server and deletes the local credentials. If the server is unreachable it still deletes the local copy and tells you the session will expire on its own.

## Revoke sessions remotely

Sign in to the dashboard and open **Settings**, **Account** to see your CLI sessions and revoke one. A revoked session stops working on its next request. The same is available through the API. See [CLI authentication endpoints](/docs/api/authentication).

## What a CLI session can do

A CLI token is accepted only by the endpoints the CLI needs: project list and detail, secret list, read, create and update, and environment export. It cannot manage members, invitations or access, delete anything, read version history, or read the audit log. Project roles and environment access still apply to every request.

## Troubleshooting

| Message | Fix |
|---|---|
| `You are not logged in. Run keel login.` | Log in. |
| `Your session has expired or was revoked. Run keel login.` | Log in again. The refresh token is expired or revoked. |
| `You are logged in to X, but this project uses Y.` | Run `keel login --api-url Y`. |
| `No API URL. Pass --api-url <url> or set KEEL_API_URL.` | Provide the server URL. |
| `Login was denied in the browser.` | Someone chose Deny. Start again. |
| `The login request expired.` | You did not approve within 10 minutes. Start again. |

## Next steps

Choose a project with [Project initialization](/docs/cli/initialization).
