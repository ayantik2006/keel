/**
 * The documentation navigation tree and reading order. This is the single
 * source of truth for sections, page order, previous/next links and the
 * sidebar. Each slug maps to content/docs/<slug>.md.
 */
export type NavSection = {
  id: string;
  title: string;
  /** Page slugs in reading order, relative to /docs. */
  pages: string[];
};

export const NAV: NavSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    pages: ["introduction", "core-concepts", "quickstart", "first-project", "first-secret"],
  },
  {
    id: "core-features",
    title: "Core Features",
    pages: [
      "managing-secrets",
      "environments",
      "version-history",
      "access-control",
      "audit-logs",
      "import-export",
      "integrations",
      "integrations/vercel",
    ],
  },
  {
    id: "cli",
    title: "CLI and Runtime",
    pages: [
      "cli/installation",
      "cli/authentication",
      "cli/initialization",
      "cli/secrets",
      "cli/run",
    ],
  },
  {
    id: "api",
    title: "API Reference",
    pages: [
      "api/overview",
      "api/authentication",
      "api/projects",
      "api/secrets",
      "api/members",
      "api/audit",
      "api/errors",
    ],
  },
  {
    id: "security",
    title: "Security",
    pages: ["security/model", "security/best-practices", "troubleshooting"],
  },
  {
    id: "reference",
    title: "Reference",
    pages: ["reference/environment-variables", "reference/glossary", "reference/faq"],
  },
];

export const docPath = (slug: string) => `/docs/${slug}`;

export const ALL_SLUGS: string[] = NAV.flatMap((s) => s.pages);

export function sectionOf(slug: string): NavSection | undefined {
  return NAV.find((s) => s.pages.includes(slug));
}

export function neighbours(slug: string) {
  const i = ALL_SLUGS.indexOf(slug);
  return {
    prev: i > 0 ? ALL_SLUGS[i - 1] : null,
    next: i >= 0 && i < ALL_SLUGS.length - 1 ? ALL_SLUGS[i + 1] : null,
  };
}
