import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Highlight from "../components/Highlight";
import ContactForm from "./ContactForm";

export const metadata: Metadata = pageMetadata({
  title: "Contact us",
  description:
    "Questions about Keel, its security model, or your workspace? Send a message and the team that builds Keel will reply.",
  path: "/contact",
});

const topics = [
  {
    title: "Support",
    body: "Something not working as expected in your workspace.",
  },
  {
    title: "Security and compliance",
    body: "Questions about encryption, access control, and audit trails.",
  },
];

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-24 sm:pt-16">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
            <div className="animate-fade-up motion-reduce:animate-none">
              <h1 className="text-balance text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">
                Talk to the{" "}
                <Highlight>Keel</Highlight> team.
              </h1>
              <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted">
                Tell us what you are working on. Your message goes straight to
                the people who build and run Keel.
              </p>

              <dl className="mt-10 border-t border-border">
                {topics.map((t) => (
                  <div key={t.title} className="border-b border-border py-4">
                    <dt className="text-[14px] font-medium">{t.title}</dt>
                    <dd className="mt-1 text-[13px] leading-relaxed text-muted">
                      {t.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div
              className="animate-fade-up motion-reduce:animate-none"
              style={{ animationDelay: "0.1s" }}
            >
              <ContactForm />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
