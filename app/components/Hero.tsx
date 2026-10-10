import HeroDashboard from "./HeroDashboard";
import Link from "next/link";
import HeroActions from "./HeroActions";
import Highlight from "./Highlight";

export default function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-10 pb-24 sm:pt-12">
      <div className="animate-fade-up">
        <h1 className="text-balance text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[42px] lg:text-[52px]">
          Centralize your{" "}
          <Highlight>secrets</Highlight>.
          <br />
          <span className="mt-2 inline-block text-muted">
            Sync{" "}
            <Highlight>everywhere</Highlight>,
            instantly.
          </span>
        </h1>

        <div className="mt-9 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <p className="max-w-lg text-[17px] leading-relaxed text-muted">
            Keel is a secrets manager for developers: one encrypted system of
            record for the API keys, tokens, and environment variables behind
            development, staging, and production.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <HeroActions />
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 border border-[#B8B8B2] px-5 py-2 text-[14px] font-medium text-ink transition-colors hover:border-ink"
            >
              View docs
            </Link>
          </div>
        </div>
      </div>

      <div
        className="mt-16 animate-fade-up sm:mt-20"
        style={{ animationDelay: "0.15s" }}
      >
        <HeroDashboard />
      </div>
    </section>
  );
}
