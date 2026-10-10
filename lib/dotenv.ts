/**
 * dotenv parsing and serialization. Pure functions with no dependencies, used
 * by the browser (import preview), the server (export) and the tests. This
 * module must never import server-only code.
 *
 * Supported syntax
 * ----------------
 * - `KEY=value`, with optional `export ` prefix and spaces around the key and
 *   the `=`. Keys follow [A-Za-z_][A-Za-z0-9_]*.
 * - Blank lines and lines starting with `#` are ignored. A UTF-8 BOM and CRLF
 *   line endings are accepted.
 * - Unquoted values are trimmed. ` #` (a hash after whitespace) starts a
 *   comment; a `#` inside a word is part of the value. No escapes.
 * - 'single quoted' values are literal: no escapes, may span lines.
 * - "double quoted" values support \n \r \t \\ \" \' and may span lines.
 *   Any other backslash sequence is kept as written (backslash included).
 * - Only whitespace or a comment may follow a closing quote.
 * - An empty value (`KEY=`) is parsed as "". Whether it can be stored is the
 *   caller's decision.
 * - Variable expansion (`${OTHER}`) is NOT performed; text is taken literally.
 *
 * Anything else on a line (no `=`, bad key, unterminated quote, junk after a
 * closing quote) is reported as an error with its line number, never guessed.
 */

export type ParsedEntry = {
  key: string;
  value: string;
  /** 1-based line where the entry starts. */
  line: number;
};

export type ParseProblem = {
  line: number;
  message: string;
  /** The key, when it could be read before the problem. */
  key?: string;
};

export type ParseResult = {
  entries: ParsedEntry[];
  problems: ParseProblem[];
};

export const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_KEY_LENGTH = 128;
export const MAX_VALUE_LENGTH = 10_000;

const ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  "\\": "\\",
  '"': '"',
  "'": "'",
};

export function parseDotenv(input: string): ParseResult {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const entries: ParsedEntry[] = [];
  const problems: ParseProblem[] = [];

  let pos = 0;
  let line = 1;

  while (pos < text.length) {
    // start of a line
    const startLine = line;
    let lineEnd = text.indexOf("\n", pos);
    if (lineEnd === -1) lineEnd = text.length;
    const raw = text.slice(pos, lineEnd);
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      pos = lineEnd + 1;
      line++;
      continue;
    }

    const match = /^\s*(?:export\s+)?([^=\s]+)\s*=/.exec(raw);
    if (!match) {
      problems.push({ line: startLine, message: "Expected KEY=VALUE." });
      pos = lineEnd + 1;
      line++;
      continue;
    }

    const key = match[1];
    let cursor = pos + match[0].length;

    if (!KEY_PATTERN.test(key) || key.length > MAX_KEY_LENGTH) {
      problems.push({
        line: startLine,
        key: key.slice(0, 64),
        message: "Invalid key. Use letters, numbers and underscores, not starting with a number.",
      });
      pos = lineEnd + 1;
      line++;
      continue;
    }

    // value
    while (cursor < lineEnd && (text[cursor] === " " || text[cursor] === "\t")) cursor++;
    const quote = text[cursor] === '"' || text[cursor] === "'" ? text[cursor] : null;

    if (!quote) {
      let value = text.slice(cursor, lineEnd);
      const hash = value.search(/\s#/);
      if (hash !== -1) value = value.slice(0, hash);
      entries.push({ key, value: value.trim(), line: startLine });
      pos = lineEnd + 1;
      line++;
      continue;
    }

    // quoted value, possibly spanning lines
    let i = cursor + 1;
    let value = "";
    let closed = false;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\" && quote === '"') {
        const next = text[i + 1];
        if (next !== undefined && next in ESCAPES) {
          value += ESCAPES[next];
          i += 2;
          continue;
        }
        value += ch; // unknown escape: keep the backslash
        i++;
        continue;
      }
      if (ch === quote) {
        closed = true;
        i++;
        break;
      }
      value += ch;
      i++;
    }

    if (!closed) {
      problems.push({ line: startLine, key, message: "Unterminated quoted value." });
      // Nothing after an unterminated quote can be trusted.
      break;
    }

    // only whitespace or a comment may follow the closing quote
    let end = text.indexOf("\n", i);
    if (end === -1) end = text.length;
    const rest = text.slice(i, end);
    const consumed = text.slice(pos, i);
    const extraLines = (consumed.match(/\n/g) ?? []).length;

    if (rest.trim() !== "" && !/^\s+#/.test(rest)) {
      problems.push({
        line: startLine,
        key,
        message: "Unexpected characters after the closing quote.",
      });
    } else {
      entries.push({ key, value, line: startLine });
    }
    line += extraLines + 1;
    pos = end + 1;
  }

  return { entries, problems };
}

const SAFE_UNQUOTED = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** Formats one value so that parseDotenv returns exactly the same string. */
export function formatDotenvValue(value: string): string {
  if (value !== "" && SAFE_UNQUOTED.test(value)) return value;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

export function serializeDotenv(pairs: { key: string; value: string }[]): string {
  for (const { key } of pairs) {
    if (!KEY_PATTERN.test(key)) throw new Error("Cannot export an invalid key.");
  }
  return pairs.map((p) => `${p.key}=${formatDotenvValue(p.value)}`).join("\n") + (pairs.length ? "\n" : "");
}

/** `.env` for no environment, otherwise `.env.<slug>`. */
export function exportFilename(environmentSlug: string): string {
  return /^[a-z0-9][a-z0-9-]{0,31}$/.test(environmentSlug)
    ? `.env.${environmentSlug}`
    : ".env";
}
