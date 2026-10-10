"use client";

import { useEffect, useState } from "react";

type Secret = {
  key: string;
  masked: string;
  revealed: string;
  updated: string;
  type: string;
};

const secrets: Secret[] = [
  {
    key: "DATABASE_URL",
    masked: "••••••••••••••••••••",
    revealed: "postgres://prod-db.•••",
    updated: "2h ago",
    type: "connection",
  },
  {
    key: "STRIPE_SECRET_KEY",
    masked: "••••••••••••••••••••",
    revealed: "sk_live_••••••••••••",
    updated: "5d ago",
    type: "api key",
  },
  {
    key: "AWS_ACCESS_KEY",
    masked: "••••••••••••••••••••",
    revealed: "AKIA••••••••••••••••",
    updated: "12d ago",
    type: "credential",
  },
  {
    key: "REDIS_URL",
    masked: "••••••••••••••••••••",
    revealed: "redis://cache.•••••••",
    updated: "1mo ago",
    type: "connection",
  },
  {
    key: "JWT_SECRET",
    masked: "••••••••••••••••••••",
    revealed: "jwt_••••••••••••••••",
    updated: "1mo ago",
    type: "signing key",
  },
];

export default function HeroDashboard() {
  const [revealedIndex, setRevealedIndex] = useState(0);
  const [showValue, setShowValue] = useState(false);

  useEffect(() => {
    const revealTimer = setTimeout(() => setShowValue(true), 1400);
    const cycle = setInterval(() => {
      setShowValue(false);
      setTimeout(() => {
        setRevealedIndex((i) => (i + 1) % secrets.length);
        setShowValue(true);
      }, 500);
    }, 3200);
    return () => {
      clearTimeout(revealTimer);
      clearInterval(cycle);
    };
  }, []);

  return (
    <div className="w-full overflow-hidden border border-border bg-surface shadow-[0_20px_50px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </div>
          <span className="ml-2 font-mono text-[12px] text-muted">
            payments-api
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="font-mono text-[12px] text-muted">production</span>
        </div>
      </div>

      <div className="px-5 py-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border py-2.5 font-mono text-[11px] uppercase tracking-wide text-muted">
          <span>Key</span>
          <span className="hidden sm:block">Type</span>
          <span>Updated</span>
        </div>

        {secrets.map((secret, i) => (
          <div
            key={secret.key}
            className="-mx-2 grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1.5 border-b border-border px-2 py-3.5 font-mono text-[13px] transition-colors last:border-b-0 hover:bg-code"
          >
            <div className="flex items-center gap-2.5 truncate">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
              <span className="truncate text-ink">{secret.key}</span>
            </div>
            <span className="hidden text-[11px] text-muted sm:block">
              {secret.type}
            </span>
            <span className="text-[11px] text-muted">{secret.updated}</span>
            <div className="col-span-3 pl-4 text-[12px] text-muted/80">
              {i === revealedIndex && showValue ? (
                <span className="text-accent">{secret.revealed}</span>
              ) : (
                <span>{secret.masked}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="font-mono text-[11px] text-muted">
          5 secrets · synced 2 minutes ago
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-accent">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
          synced
        </span>
      </div>
    </div>
  );
}
