import { buildSearchIndex } from "@/lib/docs/load";
import { sectionOf } from "@/lib/docs/nav";

/**
 * Build-time search index generated from the published documentation files.
 * Static: it only changes when the content does.
 */
export const dynamic = "force-static";

export function GET() {
  const entries = buildSearchIndex((slug) => sectionOf(slug)?.title ?? "Docs");
  return Response.json(entries);
}
