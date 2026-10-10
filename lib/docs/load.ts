import { readFileSync } from "node:fs";
import path from "node:path";
import { ALL_SLUGS } from "./nav";
import {
  parseFrontmatter,
  parseMarkdown,
  plainText,
  type DocBlock,
  type Frontmatter,
} from "./markdown";

export type DocPage = Frontmatter & {
  slug: string;
  blocks: DocBlock[];
  toc: { id: string; text: string; level: 2 | 3 }[];
};

const CONTENT_DIR = path.join(process.cwd(), "content", "docs");

const cache = new Map<string, DocPage>();

/** Reads and parses one page. Throws if the file is missing or malformed. */
export function loadDoc(slug: string): DocPage {
  const hit = cache.get(slug);
  if (hit) return hit;
  if (!ALL_SLUGS.includes(slug)) throw new Error(`Unknown docs page: ${slug}`);
  const source = readFileSync(path.join(CONTENT_DIR, `${slug}.md`), "utf8");
  const { meta, body } = parseFrontmatter(source);
  const blocks = parseMarkdown(body);
  const page: DocPage = {
    ...meta,
    slug,
    blocks,
    toc: blocks.flatMap((b) =>
      b.type === "heading" ? [{ id: b.id, text: plainText(b.text), level: b.level }] : [],
    ),
  };
  cache.set(slug, page);
  return page;
}

export const loadAllDocs = () => ALL_SLUGS.map(loadDoc);

/** One searchable section: the text under a heading (or the page intro). */
export type SearchEntry = {
  title: string;
  path: string;
  /** Section heading, or "" for the page introduction. */
  heading: string;
  anchor: string;
  section: string;
  description: string;
  text: string;
};

function blockText(b: DocBlock): string {
  switch (b.type) {
    case "p":
      return plainText(b.text);
    case "ul":
    case "ol":
      return b.items.map(plainText).join(" ");
    case "code":
      return b.code;
    case "table":
      return [b.head, ...b.rows].map((r) => r.map(plainText).join(" ")).join(" ");
    case "callout":
      return b.paras.map(plainText).join(" ");
    case "heading":
      return "";
  }
}

export function buildSearchIndex(
  sectionTitle: (slug: string) => string,
): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const page of loadAllDocs()) {
    let current: SearchEntry = {
      title: page.title,
      path: `/docs/${page.slug}`,
      heading: "",
      anchor: "",
      section: sectionTitle(page.slug),
      description: page.description,
      text: "",
    };
    const push = () => {
      current.text = current.text.replace(/\s+/g, " ").trim();
      entries.push(current);
    };
    for (const b of page.blocks) {
      if (b.type === "heading") {
        push();
        current = {
          ...current,
          heading: plainText(b.text),
          anchor: b.id,
          text: "",
        };
      } else {
        current.text += " " + blockText(b);
      }
    }
    push();
  }
  return entries;
}
