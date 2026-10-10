---
title: CLI installation
description: Requirements and steps to build and install the Keel CLI from source, verify the version, and fix common installation problems.
updated: 2026-10-11
---

The Keel CLI signs you in, lets you pick a project and environment, manages secrets, and runs commands with secrets injected.

:::planned Not published yet
The CLI is not available from npm or any package manager. The package is marked private so it cannot be published by accident. Today you build it from the Keel repository, as described below.
:::

## Requirements

- Node.js 20 or newer.
- A checkout of the Keel repository, with dependencies installed (`npm install`).
- A reachable Keel server URL.

The CLI has no runtime dependencies. It has been tested on Windows 11 with Node 22. The macOS and Linux code paths are written but have not been tested.

## Build

From the repository root:

```bash
npm run cli:build
```

This compiles `cli/src` to `cli/dist`. Run it with Node:

```bash
node cli/dist/index.js --help
```

## Put `keel` on your PATH

Link the package globally:

```bash
cd cli
npm link
```

Now `keel` works from any directory. To remove it later:

```bash
npm unlink -g keel
```

## Verify

```bash
keel --version
```

Expected output is the CLI version, currently `0.1.0`. `keel --help` lists the commands:

```text
login              Sign in through your browser
logout             Revoke this machine's session and delete credentials
init               Choose a project and environment for this directory
secrets list       List secret keys (values hidden by default)
secrets set        Create or update secrets
run -- <command>   Run a command with secrets in its environment
```

## Update

Pull the repository changes and run `npm run cli:build` again. Your credentials and `.keel.json` files stay valid.

## Troubleshooting

| Problem | Fix |
|---|---|
| `tsc: not found` or missing types | Run `npm install` in the repository root, then build again. |
| `keel: command not found` after `npm link` | Make sure npm's global bin directory is on your PATH. `npm bin -g` or `npm prefix -g` shows where it is. |
| Syntax errors on start | Node is older than 20. Check `node --version`. |
| Changes not picked up | Run `npm run cli:build` again. The link points at `cli/dist`. |

## Next steps

Sign in with [CLI authentication](/docs/cli/authentication).
