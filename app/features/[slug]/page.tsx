import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumbs from "../../components/Breadcrumbs";
import CardList from "../../components/CardList";
import Inline from "../../components/Inline";
import JsonLd from "../../components/JsonLd";
import PageCta from "../../components/PageCta";
import Prose from "../../components/Prose";
import { features, featureBySlug } from "@/lib/content/features";
import { articleBySlug } from "@/lib/content/articles";
import { absoluteUrl, pageMetadata, WEBSITE_ID } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = featureBySlug(slug);
  if (!f) return {};
  return pageMetadata({
    title: f.metaTitle,
    description: f.description,
    path: `/features/${f.slug}`,
  });
}

export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  const f = featureBySlug(slug);
  if (!f) notFound();

  const path = `/features/${f.slug}`;
  const articles = f.relatedArticles.flatMap((s) => articleBySlug(s) ?? []);
  const related = f.relatedFeatures.flatMap((s) => featureBySlug(s) ?? []);

  return (
    <>
      <Navbar />
      <main className="relative z-10">
        <article className="mx-auto max-w-6xl px-6 pt-8 pb-24">
          <Breadcrumbs
            trail={[
              { name: "Features", path: "/features" },
              { name: f.label, path },
            ]}
          />
          <header className="mt-8 max-w-3xl border-b border-border pb-10">
            <h1 className="text-balance text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">
              {f.title}
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-muted">
              {f.intro}
            </p>
          </header>

          <div className="mt-10 max-w-3xl">
            <Prose blocks={f.body} />

            <section aria-labelledby="faq" className="mt-14">
              <h2
                id="faq"
                className="text-[24px] font-semibold tracking-tight"
              >
                Frequently asked questions
              </h2>
              <dl className="mt-4 border-t border-border">
                {f.faq.map((item) => (
                  <div key={item.q} className="border-b border-border py-5">
                    <dt className="text-[16px] font-medium">{item.q}</dt>
                    <dd className="mt-2 text-[15px] leading-relaxed text-muted">
                      <Inline text={item.a} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {(articles.length > 0 || related.length > 0) && (
            <section aria-labelledby="related" className="mt-16 max-w-4xl">
              <h2
                id="related"
                className="mb-4 text-[20px] font-semibold tracking-tight"
              >
                Keep reading
              </h2>
              <CardList
                items={[
                  ...articles.map((a) => ({
                    href: `/blog/${a.slug}`,
                    title: a.title,
                    text: a.description,
                  })),
                  ...related.map((r) => ({
                    href: `/features/${r.slug}`,
                    title: r.label,
                    text: r.summary,
                  })),
                ]}
              />
            </section>
          )}

          <div className="max-w-3xl">
            <PageCta />
          </div>
        </article>
      </main>
      <Footer />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: f.title,
          description: f.description,
          url: absoluteUrl(path),
          dateModified: f.updated,
          isPartOf: { "@id": WEBSITE_ID },
        }}
      />
    </>
  );
}
