"use client";

import { useEffect, useState } from "react";
import Divider from "./Divider";

const lines = [
  { text: "$ keel login", delay: 0 },
  { text: "✓ Successfully authenticated", delay: 700, accent: true },
  { text: "", delay: 900 },
  { text: "$ keel run -- npm run dev", delay: 1300 },
  { text: "✓ Loaded 42 secrets", delay: 2100, accent: true },
  { text: "✓ Environment: development", delay: 2500, accent: true },
  { text: "✓ Project: payments-api", delay: 2900, accent: true },
  { text: "", delay: 3200 },
  { text: "Starting application...", delay: 3500 },
];

export default function DeveloperExperience() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers = lines.map((line, i) =>
      setTimeout(() => setVisible(i + 1), line.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <section>
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-lg">
          <h2 className="whitespace-nowrap text-[32px] font-semibold tracking-tight sm:text-[40px]">
            Works where your code lives.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="overflow-hidden border border-border bg-[#111111] shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="ml-2 font-mono text-[11px] text-white/40">
                zsh
              </span>
            </div>
            <div className="min-h-[260px] px-5 py-5 font-mono text-[13px] leading-[1.9]">
              {lines.slice(0, visible).map((line, i) => (
                <div
                  key={i}
                  className={
                    line.accent
                      ? "text-[#f2a069]"
                      : line.text.startsWith("$")
                        ? "text-white"
                        : "text-white/60"
                  }
                >
                  {line.text || " "}
                </div>
              ))}
              {visible >= lines.length && (
                <span className="inline-block h-[15px] w-[7px] animate-blink bg-white/70 align-middle" />
              )}
            </div>
          </div>

          <div className="border border-border bg-surface p-5">
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
              Injected at runtime
            </p>
            <div className="mt-3 space-y-2.5 font-mono text-[13px]">
              <div className="bg-code px-3 py-2">
                DATABASE_URL=••••••••
              </div>
              <div className="bg-code px-3 py-2">
                API_KEY=••••••••
              </div>
              <div className="bg-code px-3 py-2">
                STRIPE_SECRET=••••••••
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              Secrets never touch disk. They're loaded into the process
              environment and gone when it exits.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
