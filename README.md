# Keel

Keel is a self-hostable secrets manager for teams. Store environment variables per project and environment, control who can read or change them, and inject them into local commands with a CLI.

Built with Next.js (App Router), Clerk for authentication, and MongoDB for storage. Secret values are encrypted at rest with AES-256-GCM.

## Features

- **Projects and environments.** Group secrets by project, then by environment (development, production, and so on).
- **Encryption at rest.** Values are encrypted with AES-256-GCM using a key that lives only in the server environment, never in the database.
- **Role-based access control.** Four roles: owner, admin, member, viewer. Members and viewers also need an explicit per-environment grant, so access is deny by default.
- **Version history.** Every change to a secret creates a new version that can be viewed and restored.
- **Audit log.** Reads, changes, access denials and membership changes are recorded per project.
- **Team invitations.** Invite people to a project by email and assign a role.
- **Import and export.** Bring in `.env` files with a preview and conflict resolution, or export an environment.
- **Vercel integration.** Sync an environment to a Vercel project.
- **CLI.** Sign in with a device-code flow, list and set secrets, and run any command with secrets injected.
- **Built-in docs and blog.** Product docs are rendered from Markdown in `content/docs`.

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Auth | Clerk |
| Database | MongoDB |
| Styling | Tailwind CSS 4 |
| Language | TypeScript |
| CLI | Node.js 20+, zero runtime dependencies |

## Getting started

### Prerequisites

- Node.js 20 or newer
- A MongoDB instance (local or hosted)
- A [Clerk](https://clerk.com) application

### Install

```bash
git clone https://github.com/ayantik2006/keel.git
cd keel
npm install
cp .env.example .env.local
```

### Configure

Fill in `.env.local`:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `MONGODB_URI` | Yes | MongoDB connection string. The database name is taken from the path. |
| `SECRETS_ENCRYPTION_KEY` | Yes | Base64 of 32 random bytes, used to encrypt secret values |
| `NEXT_PUBLIC_FORMAS_API_KEY` | No | Form key for the contact page (public by design) |
| `NEXT_PUBLIC_SITE_URL` | No | Public origin, used for absolute social preview URLs |
| `GOOGLE_SITE_VERIFICATION` | No | Google Search Console HTML tag token |

Generate an encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The server refuses to start if `SECRETS_ENCRYPTION_KEY` is missing or malformed (see [instrumentation.ts](instrumentation.ts)). Back this key up and keep it out of version control: losing it makes stored secrets unrecoverable.

### Run

```bash
npm run dev
```

Open <http://localhost:3000>.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run cli:build` | Compile the CLI to `cli/dist` |
| `npm run cli -- <args>` | Run the compiled CLI |

## CLI

```bash
npm run cli:build
node cli/dist/index.js login --api-url http://localhost:3000
node cli/dist/index.js init
node cli/dist/index.js secrets set DB_URL
node cli/dist/index.js run -- npm run dev
```

See [cli/README.md](cli/README.md) for all commands, the authentication flow and platform notes.

## Roles

| Role | Can do |
|---|---|
| Owner | Everything an admin can, plus delete the project |
| Admin | Manage members, invitations, environment access and secrets |
| Member | Read and write secrets in environments they have been granted |
| Viewer | Read secrets in environments they have been granted |

Environment access rules are described in [docs/environment-access.md](docs/environment-access.md). Permissions are defined in [lib/permissions.ts](lib/permissions.ts).

## Project structure

```
app/            Next.js routes: marketing site, dashboard, docs, blog and API
  api/          REST endpoints for projects, secrets, members, audit, CLI auth
  dashboard/    Authenticated secrets UI
  components/   Marketing site components
cli/            The keel command line tool (separate package)
content/docs/   Markdown source for the in-app documentation
docs/           Engineering notes (access control, import/export, Vercel)
lib/            Server logic: crypto, permissions, audit, versions, db, sync
instrumentation.ts   Startup checks
proxy.ts        Clerk middleware
```

## Documentation

- User docs live in [content/docs](content/docs) and are served at `/docs`.
- Engineering notes live in [docs](docs):
  - [Environment access control](docs/environment-access.md)
  - [Importing and exporting .env files](docs/import-export.md)
  - [Vercel integration](docs/vercel-integration.md)

## Security notes

- Secret values are never logged and decryption errors never include data.
- Encryption keys are versioned (`SECRETS_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY_V2`, ...). Re-encryption of existing records under a new key is not implemented yet.
- CLI tokens are short lived (1 hour access, 30 day single-use refresh) and can only reach the endpoints the CLI needs.
