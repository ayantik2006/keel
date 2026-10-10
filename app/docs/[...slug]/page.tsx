import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import JsonLd from "@/app/components/JsonLd";
import { ALL_SLUGS, docPath, neighbours, sectionOf } from "@/lib/docs/nav";
import { loadDoc } from "@/lib/docs/load";
import { PUBLISHER_NAME, absoluteUrl, pageMetadata } from "@/lib/site";
import DocContent from "../_components/DocContent";
import Toc from "../_components/Toc";

export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_SLUGS.map((slug) => ({ slug: slug.split("/") }));
}

const slugOf = (parts: string[]) => parts.join("/");

export async function generateMetadata({
  params,
}: PageProps<"/docs/[...slug]">): Promise<Metadata> {
  const slug = slugOf((await params).slug);
  if (!ALL_SLUGS.includes(slug)) return {};
  const page = loadDoc(slug);
  return pageMetadata({
    title: page.title,
    description: page.description,
    path: docPath(slug),
    article: { publishedTime: page.updated },
  });
}

export default async function DocPage({ params }: PageProps<"/docs/[...slug]">) {
  const slug = slugOf((await params).slug);
  if (!ALL_SLUGS.includes(slug)) notFound();

  const page = loadDoc(slug);
  const section = sectionOf(slug)!;
  const { prev, next } = neighbours(slug);
  const prevPage = prev ? loadDoc(prev) : null;
  const nextPage = next ? loadDoc(next) : null;

  return (
    <div className="flex gap-10">
      <article className="min-w-0 max-w-3xl flex-1 py-8 pb-24">
        <Breadcrumbs
          trail={[
            { name: "Docs", path: "/docs" },
            { name: section.title, path: docPath(section.pages[0]) },
            { name: page.title, path: docPath(slug) },
          ]}
        />
        <h1 className="mt-6 text-balance text-[30px] font-semibold leading-tight tracking-tight">
          {page.title}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">{page.description}</p>
        <p className="mt-3 text-[12px] text-muted">
          Last updated <time dateTime={page.updated}>{page.updated}</time>
        </p>

        <div className="mt-8">
          <DocContent blocks={page.blocks} />
        </div>

        <nav
          aria-label="Previous and next pages"
          className="mt-16 grid gap-4 border-t border-border pt-6 sm:grid-cols-2"
        >
          {prevPage && prev ? (
            <Link
              href={docPath(prev)}
              rel="prev"
              className="block border border-border p-4 transition-colors hover:border-ink"
            >
              <span className="text-[12px] text-muted">Previous</span>
              <span className="mt-1 block text-[15px] font-medium">{prevPage.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextPage && next && (
            <Link
              href={docPath(next)}
              rel="next"
              className="block border border-border p-4 text-right transition-colors hover:border-ink"
            >
              <span className="text-[12px] text-muted">Next</span>
              <span className="mt-1 block text-[15px] font-medium">{nextPage.title}</span>
            </Link>
          )}
        </nav>
      </article>

      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 xl:block">
        <Toc items={page.toc} />
      </aside>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: page.title,
          description: page.description,
          dateModified: page.updated,
          mainEntityOfPage: absoluteUrl(docPath(slug)),
          publisher: { "@type": "Organization", name: PUBLISHER_NAME },
        }}
      />
    </div>
  );
}
