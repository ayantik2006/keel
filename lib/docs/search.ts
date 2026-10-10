import type { SearchEntry } from "./load";

export type Segment = { text: string; mark: boolean };

export type SearchResult = {
  entry: SearchEntry;
  score: number;
  snippet: Segment[];
};

export const tokenize = (query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^a-z0-9_]+|[^a-z0-9_]+$/g, ""))
    .filter(Boolean);

function snippetFor(entry: SearchEntry, tokens: string[]): Segment[] {
  const source = entry.text || entry.description;
  const lower = source.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  const start = Math.max(0, at === -1 ? 0 : at - 50);
  const end = Math.min(source.length, start + 170);
  let text = source.slice(start, end);
  if (start > 0) text = "..." + text;
  if (end < source.length) text += "...";

  if (tokens.length === 0) return [{ text, mark: false }];
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, mark: tokens.includes(part.toLowerCase()) }));
}

/**
 * Ranks documentation sections for a query. Every term has to match somewhere
 * in the section; headings and titles weigh more than body text.
 */
export function searchDocs(
  entries: SearchEntry[],
  query: string,
  limit = 8,
): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const results: SearchResult[] = [];
  for (const entry of entries) {
    const title = entry.title.toLowerCase();
    const heading = entry.heading.toLowerCase();
    const description = entry.description.toLowerCase();
    const text = entry.text.toLowerCase();

    let score = 0;
    let matchedAll = true;
    for (const t of tokens) {
      let s = 0;
      if (heading.includes(t)) s += 6;
      // Page-level hits weigh most on the introduction entry that represents the page.
      if (title.includes(t)) s += entry.heading === "" ? 10 : 3;
      if (description.includes(t)) s += 2;
      const count = text.split(t).length - 1;
      if (count > 0) s += 1 + Math.min(count, 3) * 0.5;
      if (s === 0) {
        matchedAll = false;
        break;
      }
      score += s;
    }
    if (!matchedAll) continue;
    // An exact phrase beats scattered words, most of all in titles and headings.
    if (tokens.length > 1) {
      const phrase = tokens.join(" ");
      if (heading.includes(phrase) || title.includes(phrase)) score += 8;
      if (description.includes(phrase)) score += 5;
      if (text.includes(phrase)) score += 3;
    }
    if (entry.heading === "") score += 1;
    results.push({ entry, score, snippet: snippetFor(entry, tokens) });
  }
  // At most two sections per page, so one page cannot fill the list.
  const perPage = new Map<string, number>();
  return results
    .sort((a, b) => b.score - a.score)
    .filter((r) => {
      const n = (perPage.get(r.entry.path) ?? 0) + 1;
      perPage.set(r.entry.path, n);
      return n <= 2;
    })
    .slice(0, limit);
}
