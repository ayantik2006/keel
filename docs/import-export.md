# Importing and exporting .env files

## Where

Secrets dashboard, next to **Add Secret**: **Import** (needs permission to
create secrets) and **Export** (needs permission to read secrets in the
environment).

## Import flow

1. Choose or drop a file named `.env`, `.env.<name>` or `*.env` (256 KB,
   500 variables maximum). It is read in the browser; nothing is uploaded yet.
2. Review the preview. Values are never shown. Each key is marked:
   - **New**: will be created.
   - **Existing**: already in this environment. Choose Skip (default) or
     Overwrite. Overwrites create a new version; the old value stays in history.
   - **Duplicate**: the key appears more than once in the file. Choose first,
     last, or skip. Import is blocked until every duplicate is resolved.
   - **Invalid**: malformed line, bad key, empty value or value over 10,000
     characters. Reported with its line number and not imported.
3. Review the summary (and tick the overwrite acknowledgement if needed), then
   confirm. Only then is anything sent to the server.
4. A result summary lists created, overwritten, unchanged, skipped and failed
   entries. Failed entries are named with a fixed reason; the rest were saved.

Server side (`POST /api/projects/:id/environments/:env/import`, browser
sessions only): the whole request is validated before any write, then each
entry goes through the same create/update code as the single-secret API, so
encryption, version history and audit events are identical. Each entry
produces `secret.created` / `secret.updated` (with `import: true`) and the
batch produces one `secrets.imported` event with counts. Values are never
logged or audited.

## Export

Export asks for confirmation, then downloads `.env.<environment>` generated in
memory by `GET .../export?format=dotenv` (the same authorization as the CLI
export, audited as `secrets.exported` with `format: dotenv`). Nothing is
stored on the server. Only the selected environment is included, and only if
the caller has access to it.

## Supported dotenv syntax

- `KEY=value`, optional `export ` prefix, spaces around key and `=`.
- Blank lines and `#` comment lines; ` #` after an unquoted value starts a
  comment (`a#b` keeps the hash). CRLF and a UTF-8 BOM are accepted.
- Unquoted values are trimmed. No escapes.
- `'single quoted'`: literal, may span lines.
- `"double quoted"`: escapes `\n \r \t \ \" \'`; other backslash sequences are
  kept as written; may span lines.
- Only whitespace or a comment may follow a closing quote.
- `${VAR}` is not expanded. Keys: `[A-Za-z_][A-Za-z0-9_]*`, up to 128 chars.

Not supported: empty values (`KEY=`) are parsed but rejected on import because
the platform requires a value; there is no variable expansion; there is no
per-file character-encoding detection (files are read as UTF-8).

Exported values are double-quoted and escaped whenever they contain anything
other than `A-Za-z0-9_@%+=:,./-`, so exporting and re-importing returns the
exact same values (verified by a round-trip test).
