import type { MetadataRoute } from "next";
import { articles } from "@/lib/content/articles";
import { features } from "@/lib/content/features";
import { ALL_SLUGS, docPath } from "@/lib/docs/nav";
import { loadDoc } from "@/lib/docs/load";
import { absoluteUrl } from "@/lib/site";

/**
 * Public, indexable pages only. Dates are the last real content change,
 * recorded in the content files, not the build time.
 */
const HOME_UPDATED = "2026-10-11";
const LEGAL_UPDATED = "2026-10-10";
const CONTACT_UPDATED = "2026-10-10";

export default function sitemap(): MetadataRoute.Sitemap {
  const latestFeature = features.map((f) => f.updated).sort().at(-1)!;
  const latestArticle = articles
    .map((a) => a.modified ?? a.published)
    .sort()
    .at(-1)!;

  const latestDoc = ALL_SLUGS.map((s) => loadDoc(s).updated).sort().at(-1)!;

  const entry = (path: string, lastModified: string, priority: number) => ({
    url: absoluteUrl(path),
    lastModified,
    priority,
  });

  return [
    entry("/", HOME_UPDATED, 1),
    entry("/features", latestFeature, 0.8),
    ...features.map((f) => entry(`/features/${f.slug}`, f.updated, 0.7)),
    entry("/blog", latestArticle, 0.7),
    ...articles.map((a) =>
      entry(`/blog/${a.slug}`, a.modified ?? a.published, 0.6),
    ),
    entry("/docs", latestDoc, 0.8),
    ...ALL_SLUGS.map((slug) => entry(docPath(slug), loadDoc(slug).updated, 0.6)),
    entry("/contact", CONTACT_UPDATED, 0.4),
    entry("/privacy", LEGAL_UPDATED, 0.3),
    entry("/terms", LEGAL_UPDATED, 0.3),
  ];
}
