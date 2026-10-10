---
title: Environment variables reference
description: Every environment variable used to deploy and operate the Keel server and CLI, with format, sensitivity and where each is read.
updated: 2026-10-11
---

These are the variables for running Keel itself, not for your applications. Examples use clearly fake placeholders.

:::security
Never commit real values. Keep sensitive variables in your hosting provider's secret store. `.env.example` in the repository lists the names with empty values.
:::

## Server variables

| Name | Required | Sensitive | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | No (public) | Clerk publishable key used by the browser and server SDK |
| `CLERK_SECRET_KEY` | Yes | **Yes** | Clerk secret key used by the server to verify sessions |
| `MONGODB_URI` | Yes | **Yes** (can embed a password) | MongoDB connection string. The database name is taken from the path. |
| `SECRETS_ENCRYPTION_KEY` | Yes | **Yes** | AES-256 key that encrypts every secret value |
| `SECRETS_ENCRYPTION_KEY_V<N>` | No | **Yes** | Key for encryption key version N, where N is 2 or higher |
| `NEXT_PUBLIC_SITE_URL` | No | No | Public origin used for canonical and social URLs |
| `GOOGLE_SITE_VERIFICATION` | No | No | Search Console HTML tag token |
| `NEXT_PUBLIC_FORMAS_API_KEY` | No | No (public) | Form key for the contact page |
| `KEEL_SYNC_DEBOUNCE_MS` | No | No | Delay before an automatic Vercel sync, default `3000` |
| `VERCEL_RETRY_DELAY_MS` | No | No | Base backoff for Vercel API retries, default `500` |

### Details and examples

#### NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY

Both come from your Clerk application. They are read by `@clerk/nextjs`, which `app/layout.tsx` and `proxy.ts` use, and by the API routes that call `auth()`.

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder
CLERK_SECRET_KEY=sk_test_placeholder
```

#### MONGODB_URI

Read in `lib/db.ts`. The server throws on first database use if it is not set. Indexes are created on connection.

```env
MONGODB_URI=mongodb://127.0.0.1:27017/keel
```

#### SECRETS_ENCRYPTION_KEY

Base64 of exactly 32 random bytes, 44 characters ending in `=`. It is validated in `lib/crypto.ts`, and `instrumentation.ts` checks it when the server starts, so a missing or malformed key stops the server immediately. A key made of one repeated byte is rejected.

Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```env
SECRETS_ENCRYPTION_KEY=<44-character-base64-value>
```

:::warning
If this key is lost or changed, existing secrets cannot be decrypted and API calls that read them fail with `500`. Back it up separately from the database. There is no recovery path and no key rotation tooling yet.
:::

#### SECRETS_ENCRYPTION_KEY_V<N>

Key for version N of the key scheme. Keys are looked up by the version recorded in each encrypted payload. New writes always use version 1, so additional versions are only needed to read data encrypted under them.

#### NEXT_PUBLIC_SITE_URL

Defaults to `https://keel.hoardspace.in`. Set it for preview and self-hosted deployments so canonical links, the sitemap and social previews use the right origin. Read in `lib/site.ts`.

```env
NEXT_PUBLIC_SITE_URL=https://keel.example.com
```

#### KEEL_SYNC_DEBOUNCE_MS and VERCEL_RETRY_DELAY_MS

Tuning values for the Vercel integration, read in `lib/vercel-sync.ts` and `lib/vercel.ts`. Defaults suit normal use.

#### NODE_ENV

Standard Node variable. In production, invitation links are not returned by the invitations API. See [Members API](/docs/api/members#invitations).

## CLI variables

| Name | Purpose |
|---|---|
| `KEEL_API_URL` | Server URL used by `keel login` when `--api-url` and `.keel.json` do not provide one |
| `KEEL_CONFIG_DIR` | Directory for stored credentials |
| `KEEL_CREDENTIAL_STORE` | Set to `file` to force the user-only file store |
| `KEEL_DEBUG` | Set to `1` to print the type of an unexpected error |

The CLI also reads `APPDATA` on Windows and `XDG_CONFIG_HOME` on Linux to locate its default config directory. See [CLI authentication](/docs/cli/authentication#where-credentials-are-stored).

## Next steps

Review the [Glossary](/docs/reference/glossary).
