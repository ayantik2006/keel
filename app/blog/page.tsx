import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Breadcrumbs from "../components/Breadcrumbs";
import PageCta from "../components/PageCta";
import { sortedArticles, readingMinutes } from "@/lib/content/articles";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description:
    "Practical guides for developers on secrets management, environment variables, API key storage, and keeping credentials out of source control.",
  path: "/blog",
});

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default function BlogIndex() {
  const posts = sortedArticles();
  return (
    <>
      <Navbar />
      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-6 pt-8 pb-24">
          <Breadcrumbs trail={[{ name: "Blog", path: "/blog" }]} />
          <h1 className="mt-8 max-w-3xl text-balance text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">
            Guides on secrets and configuration
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted">
            Practical notes for developers on handling credentials,
            environment variables, and the habits that keep them out of trouble.
          </p>
          <ul className="mt-12 divide-y divide-border border-y border-border">
            {posts.map((p) => (
              <li key={p.slug}>
                <article className="py-6">
                  <p className="text-[12px] font-medium uppercase tracking-wider text-muted">
                    {p.topic}
                    <span aria-hidden="true"> · </span>
                    <time dateTime={p.published}>
                      {dateFormat.format(new Date(p.published))}
                    </time>
                    <span aria-hidden="true"> · </span>
                    {readingMinutes(p)} min read
                  </p>
                  <h2 className="mt-2 text-[22px] font-semibold tracking-tight">
                    <Link href={`/blog/${p.slug}`} className="hover:underline">
                      {p.title}
                    </Link>
                  </h2>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
                    {p.description}
                  </p>
                </article>
              </li>
            ))}
          </ul>
          <PageCta />
        </section>
      </main>
      <Footer />
    </>
  );
}
