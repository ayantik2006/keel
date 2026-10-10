import Link from "next/link";
import Divider from "./Divider";
import { features } from "@/lib/content/features";
import { articleBySlug } from "@/lib/content/articles";

// Hand-picked entry points; the rest are reachable from /blog.
const FEATURED_ARTICLES = [
  "what-is-secrets-management",
  "environment-variables-vs-secrets",
  "keep-secrets-out-of-git-repositories",
];

export default function LearnMore() {
  const posts = FEATURED_ARTICLES.flatMap((s) => articleBySlug(s) ?? []);
  return (
    <section aria-labelledby="learn-more">
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2
          id="learn-more"
          className="max-w-xl text-balance text-[32px] font-semibold tracking-tight sm:text-[40px]"
        >
          What Keel does, and why it is built this way.
        </h2>

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <div>
            <h3 className="text-[13px] font-medium uppercase tracking-wider text-muted">
              Features
            </h3>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {features.map((f) => (
                <li key={f.slug}>
                  <Link
                    href={`/features/${f.slug}`}
                    className="block py-4 transition-colors hover:bg-code"
                  >
                    <span className="block text-[16px] font-medium">
                      {f.label}
                    </span>
                    <span className="mt-1 block text-[14px] leading-relaxed text-muted">
                      {f.summary}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[13px] font-medium uppercase tracking-wider text-muted">
              Guides
            </h3>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {posts.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="block py-4 transition-colors hover:bg-code"
                  >
                    <span className="block text-[16px] font-medium">
                      {p.title}
                    </span>
                    <span className="mt-1 block text-[14px] leading-relaxed text-muted">
                      {p.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/blog"
              className="mt-4 inline-block text-[14px] font-medium underline underline-offset-4"
            >
              All guides
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
