import type { Metadata } from "next";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Breadcrumbs from "../components/Breadcrumbs";
import CardList from "../components/CardList";
import PageCta from "../components/PageCta";
import { features } from "@/lib/content/features";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Features",
  description:
    "What Keel does today: encrypted secrets, environment separation, role-based access, version history, and audit logging for application teams.",
  path: "/features",
});

export default function FeaturesPage() {
  return (
    <>
      <Navbar />
      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-6 pt-8 pb-24">
          <Breadcrumbs trail={[{ name: "Features", path: "/features" }]} />
          <h1 className="mt-8 max-w-3xl text-balance text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">
            Features for managing application secrets
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted">
            Keel is built around a small set of things teams need to get right:
            where secrets are stored, how they differ by environment, who can
            read them, what changed, and who did it.
          </p>
          <div className="mt-12">
            <CardList
              items={features.map((f) => ({
                href: `/features/${f.slug}`,
                title: f.label,
                text: f.summary,
              }))}
            />
          </div>
          <PageCta />
        </section>
      </main>
      <Footer />
    </>
  );
}
