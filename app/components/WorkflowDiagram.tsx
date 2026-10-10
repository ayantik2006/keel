import Divider from "./Divider";
import { LogoMark } from "./Logo";

const stages = [
  {
    label: "DEVELOP",
    items: [".env", "Local development"],
  },
  {
    label: "DEPLOY",
    items: ["CI/CD", "GitHub Actions"],
  },
  {
    label: "RUN",
    items: ["Production", "Cloud infrastructure"],
  },
];

export default function WorkflowDiagram() {
  return (
    <section>
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-lg">
          <h2 className="text-balance text-[32px] font-semibold tracking-tight sm:text-[40px]">
            From code to production.
          </h2>
        </div>

        <div className="mt-16">
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
            {stages.map((stage, i) => (
              <div key={stage.label} className="relative px-2 pb-10 sm:pb-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-accent">
                    {stage.label}
                  </span>
                </div>
                <div className="mt-4 space-y-1.5">
                  {stage.items.map((item) => (
                    <div
                      key={item}
                      className="border border-border bg-surface px-3 py-2 text-[13px]"
                    >
                      {item}
                    </div>
                  ))}
                </div>

                {i < stages.length - 1 && (
                  <>
                    <div className="pointer-events-none absolute left-1/2 top-full hidden h-10 w-px -translate-x-1/2 bg-border sm:hidden" />
                    <div className="pointer-events-none absolute right-[-14px] top-9 hidden h-px w-7 bg-border sm:block">
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 text-muted">
                        ›
                      </span>
                    </div>
                  </>
                )}
                {i < stages.length - 1 && (
                  <div className="mt-4 flex justify-center sm:hidden">
                    <span className="text-muted">↓</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="relative mt-10 flex items-center gap-4 border border-border bg-code/60 px-6 py-5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div>
              <LogoMark className="h-5 w-5 text-ink" />
              <p className="mt-0.5 text-[13px] text-muted">
                The infrastructure layer connecting every stage.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
