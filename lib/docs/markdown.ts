/**
 * A small, strict Markdown subset for the documentation. Supported:
 *   ## / ### headings, paragraphs, - and 1. lists, fenced code, pipe tables,
 *   :::note|warning|security|planned callouts, and inline `code`, **bold**,
 *   and [label](href) links. Anything else is treated as paragraph text.
 */
export type CalloutKind = "note" | "warning" | "security" | "planned";

export type DocBlock =
  | { type: "heading"; level: 2 | 3; text: string; id: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; lang: string; code: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "callout"; kind: CalloutKind; title: string; paras: string[] };

export type Frontmatter = {
  title: string;
  description: string;
  /** ISO date of the last real content change. */
  updated: string;
};

export function parseFrontmatter(source: string): { meta: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) throw new Error("Missing frontmatter");
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const { title, description, updated } = fields;
  if (!title || !description || !updated)
    throw new Error("Frontmatter needs title, description and updated");
  return { meta: { title, description, updated }, body: source.slice(match[0].length) };
}

/** Strips inline markup so headings and search text are plain. */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export function slugifyHeading(text: string): string {
  return (
    plainText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section"
  );
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

const CALLOUT_TITLES: Record<CalloutKind, string> = {
  note: "Note",
  warning: "Warning",
  security: "Security",
  planned: "Not available yet",
};

export function parseMarkdown(body: string): DocBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  const usedIds = new Map<string, number>();
  let i = 0;

  const isBlockStart = (l: string) =>
    /^(#{2,3}\s|```|:::|\s*[-*]\s|\s*\d+\.\s|\|)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2].trim();
      let id = slugifyHeading(text);
      const seen = usedIds.get(id) ?? 0;
      usedIds.set(id, seen + 1);
      if (seen > 0) id = `${id}-${seen + 1}`;
      blocks.push({ type: "heading", level: heading[1].length as 2 | 3, text, id });
      i++;
      continue;
    }

    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ type: "code", lang: fence[1] || "text", code: code.join("\n") });
      continue;
    }

    const callout = /^:::(note|warning|security|planned)\s*(.*)$/.exec(line);
    if (callout) {
      const paras: string[] = [];
      let current: string[] = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) {
        if (!lines[i].trim()) {
          if (current.length) paras.push(current.join(" "));
          current = [];
        } else current.push(lines[i].trim());
        i++;
      }
      if (current.length) paras.push(current.join(" "));
      i++;
      const kind = callout[1] as CalloutKind;
      blocks.push({
        type: "callout",
        kind,
        title: callout[2].trim() || CALLOUT_TITLES[kind],
        paras,
      });
      continue;
    }

    if (line.startsWith("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "")) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", head, rows });
      continue;
    }

    const ul = /^\s*[-*]\s+/.test(line);
    const ol = /^\s*\d+\.\s+/.test(line);
    if (ul || ol) {
      const marker = ul ? /^\s*[-*]\s+/ : /^\s*\d+\.\s+/;
      const items: string[] = [];
      while (i < lines.length && marker.test(lines[i])) {
        let text = lines[i].replace(marker, "");
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !marker.test(lines[i])) {
          text += " " + lines[i].trim();
          i++;
        }
        items.push(text);
      }
      blocks.push({ type: ul ? "ul" : "ol", items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }
  return blocks;
}
