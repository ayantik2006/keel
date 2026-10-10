import type { Metadata } from "next";

/** Preferred production origin. Override with NEXT_PUBLIC_SITE_URL for previews. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://keel.hoardspace.in"
).replace(/\/+$/, "");

export const GITHUB_URL = "https://github.com/ayantik2006/keel";
export const SITE_NAME = "Keel";
export const PUBLISHER_NAME = "HoardSpace";
export const OG_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Keel. Your secrets. Under control.",
};

export const WEBSITE_ID = `${SITE_URL}/#website`;
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export const absoluteUrl = (path: string) =>
  `${SITE_URL}${path === "/" ? "" : path}`;

type PageMeta = {
  /** Page title without the site suffix; the layout template adds " | Keel". */
  title: string;
  description: string;
  /** Canonical path, e.g. "/features/audit-logging". */
  path: string;
  article?: { publishedTime: string; modifiedTime?: string };
};

/**
 * Builds a complete metadata object for a public page. Next replaces whole
 * `openGraph` and `twitter` objects rather than merging them, so each page has
 * to carry the image and site name itself.
 */
export function pageMetadata({
  title,
  description,
  path,
  article,
}: PageMeta): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: article ? "article" : "website",
      siteName: SITE_NAME,
      title,
      description,
      url: path,
      images: [OG_IMAGE],
      ...(article && {
        publishedTime: article.publishedTime,
        modifiedTime: article.modifiedTime ?? article.publishedTime,
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

/** Metadata for pages that must never appear in search results. */
export const noIndex: Metadata = {
  robots: { index: false, follow: false },
};
