/**
 * Content model shared by feature pages and articles. Inline text supports
 * `[label](href)` links, `code` and **bold**; see app/components/Inline.tsx.
 */
export type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; lang?: string; code: string }
  | { type: "note"; text: string };

export type Faq = { q: string; a: string };

export type Feature = {
  slug: string;
  /** The H1. */
  title: string;
  /** Unique <title>, without the site suffix. */
  metaTitle: string;
  description: string;
  /** Short label used in navigation and cards. */
  label: string;
  /** One sentence used on index cards. */
  summary: string;
  /** ISO date of the last real content change. */
  updated: string;
  intro: string;
  body: Block[];
  faq: Faq[];
  relatedArticles: string[];
  relatedFeatures: string[];
};

export type Article = {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  published: string;
  /** Set only when the content was genuinely revised. */
  modified?: string;
  topic: string;
  body: Block[];
  relatedArticles: string[];
  relatedFeatures: string[];
};
