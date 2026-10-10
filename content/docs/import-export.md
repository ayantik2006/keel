---
title: Import and export
description: Bring an existing .env file into a Keel environment and export an environment back to a .env file, including the supported syntax and limits.
updated: 2026-10-11
---

Import moves an existing `.env` file into one environment. Export downloads one environment as a `.env` file. Both are in the secrets view, next to **Add Secret**.

## Prerequisites

- Import needs `secrets:create` (and `secrets:update` if you choose to overwrite) in the environment.
- Export needs `secrets:read` in the environment.

## Import a file

1. Select the environment you want to import into.
2. Choose **Import** and pick or drop a file named `.env`, `.env.<name>` or `*.env`. The file can be up to 256 KB and 500 variables.
3. Review the preview. The file is read in your browser and nothing is uploaded yet. Values are never shown. Each key is marked:
   - **New**: will be created.
   - **Existing**: already in this environment. Choose Skip (the default) or Overwrite. Overwriting creates a new version and keeps the old value in history.
   - **Duplicate**: the key appears more than once in the file. Choose first, last or skip. Import is blocked until every duplicate is resolved.
   - **Invalid**: bad line, bad key, empty value, or value over 10,000 characters. Reported with its line number and not imported.
4. Confirm. If you chose any overwrite, tick the acknowledgement.
5. Read the result summary: created, overwritten, unchanged, skipped and failed.

Import is dashboard-only. The server validates the whole request before writing anything, then each entry goes through the same create and update path as single secrets, so encryption, versioning and audit events are identical. Each entry records `secret.created` or `secret.updated` with `import: true`, and the batch records one `secrets.imported` event with the counts.

## Supported syntax

| Form | Behavior |
|---|---|
| `KEY=value` | Optional `export ` prefix and spaces around the key and `=` |
| Comments | Blank lines and lines starting with `#`. A ` #` after an unquoted value starts a comment, but `a#b` keeps the hash |
| Unquoted values | Trimmed, no escapes |
| `'single quoted'` | Literal text, may span lines |
| `"double quoted"` | Escapes `\n`, `\r`, `\t`, `\\`, `\"`, `\'`, may span lines |
| Line endings | CRLF and a UTF-8 byte order mark are accepted |

Not supported: variable expansion such as `${OTHER}`, and empty values (`KEY=` is parsed but rejected because Keel requires a value).

## Export an environment

1. Choose **Export** and confirm.
2. The browser downloads `.env.<environment>`.

The file is generated in memory, streamed to you and not stored on the server. Values that contain anything other than `A-Z a-z 0-9 _ @ % + = : , . / -` are double-quoted and escaped, so importing the file again returns exactly the same values.

Each export is recorded as `secrets.exported` with the number of keys and `format: dotenv`.

:::security
An exported file is a plaintext copy of every secret in the environment. Delete it when you finish, do not commit it, and prefer `keel run` for local development.
:::

## Limits

| Limit | Value |
|---|---|
| Import file size in the dashboard | 256 KB |
| Variables per import | 500 |
| Request size accepted by the server | 2,000,000 bytes |
| Import rate | 10 requests per minute per user |
| Export rate | 30 requests per minute per user |

## Next steps

See [Integrations](/docs/integrations) to push secrets to a deployment platform.
