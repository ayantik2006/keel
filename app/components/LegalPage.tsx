import type { ReactNode } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};

type Props = {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
};

/** Shared layout for long-form legal pages: header, contents list, sections. */
export default function LegalPage({ title, intro, updated, sections }: Props) {
  return (
    <>
      <Navbar />
      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-24 sm:pt-16">
          <header className="animate-fade-up border-b border-border pb-10 motion-reduce:animate-none">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted">
              Last updated {updated}
            </p>
            <h1 className="mt-3 text-balance text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted">
              {intro}
            </p>
          </header>

          <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-16">
            <nav aria-label="On this page" className="hidden lg:block">
              <ol className="sticky top-24 space-y-1 border-l border-border">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink"
                    >
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="max-w-2xl space-y-12">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="text-[20px] font-semibold tracking-tight">
                    <span className="mr-2 text-muted">{i + 1}.</span>
                    {s.title}
                  </h2>
                  <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                    {s.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
