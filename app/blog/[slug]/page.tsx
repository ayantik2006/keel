import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumbs from "../../components/Breadcrumbs";
import CardList from "../../components/CardList";
import JsonLd from "../../components/JsonLd";
import PageCta from "../../components/PageCta";
import Prose from "../../components/Prose";
import {
  articles,
  articleBySlug,
  readingMinutes,
} from "@/lib/content/articles";
import { featureBySlug } from "@/lib/content/features";
import {
  absoluteUrl,
  OG_IMAGE,
  PUBLISHER_NAME,
  pageMetadata,
  SITE_NAME,
} from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = articleBySlug(slug);
  if (!a) return {};
  return pageMetadata({
    title: a.metaTitle,
    description: a.description,
    path: `/blog/${a.slug}`,
    article: { publishedTime: a.published, modifiedTime: a.modified },
  });
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const a = articleBySlug(slug);
  if (!a) notFound();

  const path = `/blog/${a.slug}`;
  const posts = a.relatedArticles.flatMap((s) => articleBySlug(s) ?? []);
  const feats = a.relatedFeatures.flatMap((s) => featureBySlug(s) ?? []);

  return (
    <>
      <Navbar />
      <main className="relative z-10">
        <article className="mx-auto max-w-6xl px-6 pt-8 pb-24">
          <Breadcrumbs
            trail={[
              { name: "Blog", path: "/blog" },
              { name: a.metaTitle, path },
            ]}
          />
          <header className="mt-8 max-w-3xl border-b border-border pb-10">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted">
              {a.topic}
              <span aria-hidden="true"> · </span>
              <time dateTime={a.published}>
                {dateFormat.format(new Date(a.published))}
              </time>
              {a.modified && (
                <>
                  <span aria-hidden="true"> · </span>
                  Updated{" "}
                  <time dateTime={a.modified}>
                    {dateFormat.format(new Date(a.modified))}
                  </time>
                </>
              )}
              <span aria-hidden="true"> · </span>
              {readingMinutes(a)} min read
            </p>
            <h1 className="mt-3 text-balance text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">
              {a.title}
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-muted">
              {a.description}
            </p>
            <p className="mt-4 text-[13px] text-muted">By the Keel team</p>
          </header>

          <div className="mt-10 max-w-3xl">
            <Prose blocks={a.body} />
          </div>

          <section aria-labelledby="related" className="mt-16 max-w-4xl">
            <h2
              id="related"
              className="mb-4 text-[20px] font-semibold tracking-tight"
            >
              Related reading
            </h2>
            <CardList
              items={[
                ...posts.map((p) => ({
                  href: `/blog/${p.slug}`,
                  title: p.title,
                  text: p.description,
                })),
                ...feats.map((f) => ({
                  href: `/features/${f.slug}`,
                  title: f.label,
                  text: f.summary,
                })),
              ]}
            />
          </section>

          <div className="max-w-3xl">
            <PageCta />
          </div>
        </article>
      </main>
      <Footer />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: a.title,
          description: a.description,
          mainEntityOfPage: absoluteUrl(path),
          url: absoluteUrl(path),
          datePublished: a.published,
          dateModified: a.modified ?? a.published,
          image: absoluteUrl(OG_IMAGE.url),
          author: { "@type": "Organization", name: `${SITE_NAME} team` },
          publisher: {
            "@type": "Organization",
            name: PUBLISHER_NAME,
            logo: {
              "@type": "ImageObject",
              url: absoluteUrl("/keel-brand-assets/keel-icon.png"),
            },
          },
        }}
      />
    </>
  );
}
