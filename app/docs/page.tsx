import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import { NAV, docPath } from "@/lib/docs/nav";
import { loadDoc } from "@/lib/docs/load";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Keel Documentation",
  description:
    "Learn how Keel stores encrypted secrets, separates environments, controls access, and injects variables into local applications through the CLI.",
  path: "/docs",
});

/** The recommended reading order for someone new to Keel. */
const ONBOARDING = [
  { slug: "introduction", label: "Introduction" },
  { slug: "quickstart", label: "Quickstart" },
  { slug: "first-project", label: "Your first project" },
  { slug: "first-secret", label: "Your first secret" },
  { slug: "cli/installation", label: "CLI setup" },
  { slug: "cli/run", label: "Runtime injection" },
  { slug: "integrations", label: "Integrations" },
];

export default function DocsHome() {
  return (
    <div className="max-w-4xl py-10 pb-24">
      <Breadcrumbs trail={[{ name: "Docs", path: "/docs" }]} />
      <h1 className="mt-6 text-balance text-[34px] font-semibold leading-tight tracking-tight">
        Keel documentation
      </h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">
        Keel stores application secrets encrypted, keeps them separate per
        environment, controls who can read them, and records every change. These
        docs describe what Keel does today, including its current limits.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={docPath("quickstart")}
          className="inline-flex h-10 items-center bg-ink px-4 text-[14px] font-medium text-white transition-colors hover:bg-accent"
        >
          Start the quickstart
        </Link>
        <Link
          href={docPath("introduction")}
          className="inline-flex h-10 items-center border border-[#B8B8B2] px-4 text-[14px] font-medium transition-colors hover:border-ink"
        >
          What is Keel?
        </Link>
      </div>

      <section aria-labelledby="path" className="mt-14">
        <h2 id="path" className="text-[20px] font-semibold tracking-tight">
          Recommended path
        </h2>
        <p className="mt-2 text-[15px] text-muted">
          If you are new, read these in order. Each page links to the next.
        </p>
        <ol className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-2">
          {ONBOARDING.map((step, i) => (
            <li key={step.slug} className="bg-background">
              <Link
                href={docPath(step.slug)}
                className="flex items-baseline gap-3 px-4 py-3 text-[15px] transition-colors hover:bg-code"
              >
                <span className="font-mono text-[12px] text-muted">{i + 1}</span>
                <span className="font-medium">{step.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-14 space-y-10">
        {NAV.map((section) => (
          <section key={section.id} aria-labelledby={`s-${section.id}`}>
            <h2 id={`s-${section.id}`} className="text-[20px] font-semibold tracking-tight">
              {section.title}
            </h2>
            <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {section.pages.map((slug) => {
                const page = loadDoc(slug);
                return (
                  <li key={slug}>
                    <Link href={docPath(slug)} className="group block">
                      <span className="text-[15px] font-medium underline-offset-4 group-hover:underline">
                        {page.title}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                        {page.description}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
