import Divider from "./Divider";

const navItems = [
  "Projects",
  "Environments",
  "Secrets",
  "Machine Identities",
  "Audit Logs",
  "Integrations",
];

const environments = ["development", "staging", "production"];

const secrets = [
  { key: "DATABASE_URL", value: "••••••••••••••••••••", tag: "connection" },
  { key: "STRIPE_SECRET_KEY", value: "••••••••••••••••••••", tag: "api key" },
  { key: "AWS_ACCESS_KEY", value: "••••••••••••••••••••", tag: "credential" },
  { key: "REDIS_URL", value: "••••••••••••••••••••", tag: "connection" },
  { key: "JWT_SECRET", value: "••••••••••••••••••••", tag: "signing key" },
  { key: "SENTRY_DSN", value: "••••••••••••••••••••", tag: "monitoring" },
];

export default function ProductShowcase() {
  return (
    <section>
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-xl">
          <h2 className="text-balance text-[32px] font-semibold tracking-tight sm:text-[40px]">
            One place for every secret.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">
            Manage environments, credentials, machine identities, and access
            from a single system.
          </p>
        </div>

        <div className="mt-14 overflow-hidden border border-border bg-surface shadow-[0_20px_50px_rgba(0,0,0,0.08)]">
          <div className="grid grid-cols-[200px_1fr]">
            <aside className="hidden border-r border-border bg-code/60 px-4 py-5 sm:block">
              <p className="px-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                payments-api
              </p>
              <nav className="mt-4 flex flex-col gap-0.5">
                {navItems.map((item) => (
                  <span
                    key={item}
                    className={`px-2 py-1.5 text-[13px] transition-colors ${
                      item === "Secrets"
                        ? "bg-surface text-ink shadow-sm border border-border"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </nav>
            </aside>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
                <div className="flex items-center gap-1 border border-border bg-code/60 p-1">
                  {environments.map((env) => (
                    <span
                      key={env}
                      className={`px-3 py-1.5 font-mono text-[12px] transition-colors ${
                        env === "production"
                          ? "bg-surface text-ink shadow-sm"
                          : "text-muted"
                      }`}
                    >
                      {env}
                    </span>
                  ))}
                </div>
                <span className="font-mono text-[11px] text-muted">
                  6 secrets
                </span>
              </div>

              <div className="px-6 py-2">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border py-2.5 font-mono text-[11px] uppercase tracking-wide text-muted">
                  <span>Key</span>
                  <span className="hidden sm:block">Value</span>
                  <span>Type</span>
                </div>
                {secrets.map((s) => (
                  <div
                    key={s.key}
                    className="-mx-2 grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-2 py-3.5 font-mono text-[13px] transition-colors last:border-b-0 hover:bg-code/60"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                      <span className="truncate">{s.key}</span>
                    </div>
                    <span className="hidden text-muted sm:block">
                      {s.value}
                    </span>
                    <span className="text-[11px] text-muted">{s.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
