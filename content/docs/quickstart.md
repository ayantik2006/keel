---
title: Quickstart
description: Go from a new account to a local application running with secrets injected from Keel, in about ten minutes.
updated: 2026-10-11
---

In this tutorial you create a project, add two secrets, then run a local Node.js script that receives them as environment variables without any `.env` file.

## Before you start

- A Keel deployment you can reach. This guide uses `https://keel.example.com`. Replace it with your own URL, or use `http://localhost:3000` if you run Keel locally.
- Node.js 20 or newer on your machine, for the CLI.
- A copy of the Keel repository, because the CLI is built from source. See [CLI installation](/docs/cli/installation).

## 1. Sign in or create an account

Open your Keel URL and choose **Get started for free**, or go to `/sign-up`. If you already have an account, go to `/sign-in`. Authentication is handled by Clerk, so the available sign-in methods depend on how your deployment is configured.

After signing in you land on the dashboard at `/dashboard`.

## 2. Create a project

1. In the dashboard sidebar, open **Projects**.
2. Choose **Create Project**.
3. Enter a **Name**, for example `Web App`, and an optional description.
4. All three environments are selected by default. Keep the ones you expect to use and clear the rest.
5. Create the project.

You become the project's owner. See [Your first project](/docs/first-project) for naming and environment advice.

:::note
Environments are chosen at creation. There is no way to add one to an existing project yet, so select every environment you expect to need.
:::

## 3. Select an environment and add a secret

1. Open **Secrets** in the sidebar and select your project.
2. Use the environment picker to select **Development**.
3. Choose **Add Secret**.
4. Enter the key `DATABASE_URL`.
5. Enter a placeholder value such as `postgres://user:password@localhost:5432/app_dev`.
6. Save.

Use a fake value for this tutorial. You can replace it with a real one later.

## 4. Add a second secret

Repeat the steps with the key `API_KEY` and the value `dev-key-not-a-real-credential`.

You now have two secrets in the Development environment. Their values are shown masked in the list. Using the reveal button (labelled `Reveal value of API_KEY`) shows a value and records an event in the audit log.

## 5. How the values are stored

When you save a secret, the server encrypts the value with AES-256-GCM before writing it to the database. Listing secrets returns only metadata (key, version and timestamps), never values. A value is decrypted only when someone with permission reveals it, exports an environment, or runs `keel run`. Details are in the [Security model](/docs/security/model).

## 6. Build and authenticate the CLI

From the root of the Keel repository:

```bash
npm run cli:build
node cli/dist/index.js --version
```

Expected output is a version number such as `0.1.0`. To use `keel` directly, link the package:

```bash
cd cli && npm link
keel --version
```

Sign in, pointing the CLI at your server:

```bash
keel login --api-url https://keel.example.com
```

The CLI prints a link and a short code, and opens your browser. Check that the code matches, then approve it. The terminal prints `Logged in as you@example.com.`

## 7. Initialize your application directory

In the directory of the application that needs the secrets:

```bash
keel init
```

Choose your project, then **development**. The CLI writes a `.keel.json` file containing the API URL, project id and environment. It holds no secrets, but keep it out of Git:

```gitignore
.keel.json
```

## 8. Verify without printing values

List the keys. Values stay masked:

```bash
keel secrets list
```

```text
KEY           VALUE         VERSION  UPDATED
API_KEY       ********      v1       2026-10-11T09:30:00.000Z
DATABASE_URL  ********      v1       2026-10-11T09:29:12.000Z
```

## 9. Run an application with secrets injected

Create `check.mjs`. It reports whether the variables exist and their length, never their values:

```js
for (const name of ["DATABASE_URL", "API_KEY"]) {
  const value = process.env[name];
  console.log(name, value ? `present (${value.length} characters)` : "MISSING");
}
```

Run it through Keel:

```bash
keel run -- node check.mjs
```

Expected output:

```text
Injecting 2 secrets from Web App / development
DATABASE_URL present (47 characters)
API_KEY present (29 characters)
```

The first line comes from the CLI on stderr. The rest is your script. Nothing was written to disk.

## Troubleshooting

- `You are not logged in. Run keel login.` Run `keel login --api-url <url>` again.
- `No .keel.json found.` Run `keel init` in your application directory.
- `You do not have access to any projects.` Check you signed in with the account that owns the project.

More in [Troubleshooting](/docs/troubleshooting).

## Next steps

Read [Your first project](/docs/first-project), then [Your first secret](/docs/first-secret). To go deeper on the CLI, see [Runtime secret injection](/docs/cli/run).
