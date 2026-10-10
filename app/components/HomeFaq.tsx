import type { ReactNode } from "react";
import Link from "next/link";
import Divider from "./Divider";

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "What is Keel?",
    a: "Keel is a secrets manager for developers. It stores API keys, tokens, and environment variables in one encrypted workspace, separated by project and environment, with role-based access and a record of every change.",
  },
  {
    q: "How are my secrets protected?",
    a: (
      <>
        Values are encrypted at rest with AES-256-GCM, and every read passes a
        server-side check of your role and environment access before anything is
        decrypted. See{" "}
        <Link href="/features/secrets-management">how secrets are stored</Link>.
      </>
    ),
  },
  {
    q: "Can I bring my existing .env files?",
    a: (
      <>
        Yes. Import parses the file in your browser, shows a preview without
        values, and saves nothing until you confirm. See{" "}
        <Link href="/features/environment-variables">
          environment variable management
        </Link>
        .
      </>
    ),
  },
  {
    q: "Can I limit who sees production?",
    a: (
      <>
        Yes. Members and viewers have no environment access until an admin
        grants it, and Production is not special-cased. See{" "}
        <Link href="/features/access-control">access control</Link>.
      </>
    ),
  },
  {
    q: "Does Keel rotate secrets automatically?",
    a: "Not yet. You change a value yourself, and Keel keeps the earlier versions so you can restore one if needed.",
  },
  {
    q: "Does it work with Vercel?",
    a: "Admins can connect a Vercel project and push secrets to its environment variables. The integration is new, so check the result in Vercel after your first sync.",
  },
];

export default function HomeFaq() {
  return (
    <section aria-labelledby="faq">
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2
          id="faq"
          className="text-balance text-[32px] font-semibold tracking-tight sm:text-[40px]"
        >
          Frequently asked questions
        </h2>
        <dl className="mt-12 max-w-3xl border-t border-border">
          {faqs.map((f) => (
            <div key={f.q} className="border-b border-border py-6">
              <dt className="text-[17px] font-medium">{f.q}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-muted [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4">
                {f.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
