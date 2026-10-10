---
title: Project initialization
description: Use keel init to link a local directory to a Keel project and environment, and understand the generated .keel.json file.
updated: 2026-10-11
---

`keel init` links a directory to one project and one environment, so later commands do not need flags.

## Prerequisites

The CLI is installed. See [CLI installation](/docs/cli/installation). You do not have to be logged in: `keel init` starts a login first if needed.

## Run init

In your application directory:

```bash
keel init
```

You are asked to select a project and then an environment. Only projects and environments you are authorized for are offered.

```text
Select a project:
  1) Web App (owner)
  2) Billing API (member)
Select an environment:
  1) development
  2) staging

Saved .keel.json: Web App / development
To change the project or environment, run `keel init` again.
```

To skip the prompts:

```bash
keel init --project <project-id> --env development
```

| Option | Purpose |
|---|---|
| `--project <id>` | Project id, skips the project prompt |
| `--env <slug>` | `development`, `staging` or `production`, skips the prompt |
| `--api-url <url>` | Server to use if you are not logged in yet |

In a non-interactive terminal, such as a script, the prompts cannot run and the CLI asks you to pass `--project` and `--env`.

You can copy a project id from **Settings**, **General**, where it is labelled **Project ID**.

## The `.keel.json` file

```json
{
  "apiUrl": "https://keel.example.com",
  "projectId": "d4b1c8f0-0000-0000-0000-000000000000",
  "environment": "development",
  "projectName": "Web App"
}
```

| Field | Meaning |
|---|---|
| `apiUrl` | The server this project belongs to |
| `projectId` | The project identifier |
| `environment` | The environment slug used by default |
| `projectName` | Shown in messages only |

The file holds identifiers only: never tokens or secret values. It is still specific to you, so keep it out of Git:

```gitignore
.keel.json
```

The CLI looks for `.keel.json` in the current directory and then in each parent directory, so running commands from a subdirectory works. Contents are validated on every use, and anything malformed is rejected rather than guessed.

## Choose the right project and environment

- Check the line `Injecting N secrets from <project> / <environment>` that `keel run` prints.
- Run `keel init` again to switch, or pass `--env <slug>` to one command.
- If you work on several applications, each directory gets its own `.keel.json`.

## Handle missing or broken configuration

| Message | Fix |
|---|---|
| `No .keel.json found. Run keel init in your project directory.` | Run `keel init` there, or from a child of the directory that has it. |
| `.keel.json is not valid JSON. Run keel init to recreate it.` | Re-run `keel init`. It overwrites the file. |
| `Invalid .keel.json: projectId is missing or malformed.` | Re-run `keel init`. |
| `You do not have access to any projects.` | You belong to no project with this account. |
| `You have no access to any environment in your projects. Ask a project admin for access.` | Ask an admin to grant an environment. |

## Next steps

Use [Retrieving and setting secrets](/docs/cli/secrets).
