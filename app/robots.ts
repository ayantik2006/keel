import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Only the API is disallowed. Private pages (dashboard, invite, sign-in) are
 * left crawlable on purpose so crawlers can see their noindex header: a
 * robots.txt block would stop them reading it. Real protection is
 * authentication, not this file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
