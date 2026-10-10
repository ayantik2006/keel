import type { ReactNode } from "react";

export const primaryButton =
  "bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60";
export const ghostButton =
  "border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-60";
export const dangerButton =
  "bg-red-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60";
export const inputClass =
  "block w-full border border-[#B8B8B2] bg-surface px-3 py-2 text-[14px] outline-none transition-colors placeholder:text-muted/70 hover:border-ink focus:border-ink disabled:cursor-not-allowed disabled:bg-code/60 disabled:text-muted disabled:hover:border-[#B8B8B2]";

type CardProps = {
  title: string;
  description?: string;
  /** Optional mark shown before the title, such as a provider logo. */
  icon?: ReactNode;
  /** Controls shown on the right of the header. */
  action?: ReactNode;
  /** Sticky action bar at the bottom of the card. */
  footer?: ReactNode;
  tone?: "default" | "danger";
  children: ReactNode;
};

/** A titled panel. The unit every settings page is built from. */
export function Card({
  title,
  description,
  icon,
  action,
  footer,
  tone = "default",
  children,
}: CardProps) {
  const danger = tone === "danger";
  return (
    <section
      className={`border bg-surface ${danger ? "border-red-200" : "border-border"}`}
    >
      <header
        className={`flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
          danger ? "border-red-200" : "border-border"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <h3
              className={`text-[14px] font-semibold ${danger ? "text-red-700" : ""}`}
            >
              {title}
            </h3>
            {description && (
              <p className="mt-0.5 text-[13px] text-muted">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
      {footer && (
        <footer
          className={`flex flex-wrap items-center justify-between gap-3 border-t bg-code/40 px-5 py-3 ${
            danger ? "border-red-200" : "border-border"
          }`}
        >
          {footer}
        </footer>
      )}
    </section>
  );
}

/** A label and value pair. Rows stack inside a Card and are divided by rules. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 text-[13px] sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Wraps Row entries in a definition list with dividers. */
export function Rows({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-border">{children}</dl>;
}

type FieldProps = {
  /** Must match the id on the control inside. Help text gets `${id}-help`. */
  id: string;
  label: string;
  optional?: boolean;
  /** Replaces the hint and renders as an error. */
  error?: string | null;
  hint?: string;
  /** Shown at the right of the help line, such as a character count. */
  counter?: string;
  children: ReactNode;
};

/** Label above the control, help or error text below it. */
export function Field({
  id,
  label,
  optional,
  error,
  hint,
  counter,
  children,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-muted">Optional</span>
        )}
      </label>
      {children}
      {(error || hint || counter) && (
        <div className="mt-1.5 flex items-start justify-between gap-4 text-[12px]">
          <p
            id={`${id}-help`}
            role={error ? "alert" : undefined}
            className={error ? "text-red-600" : "text-muted"}
          >
            {error ?? hint}
          </p>
          {counter && (
            <span className="shrink-0 tabular-nums text-muted">{counter}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="bg-code px-2 py-0.5 text-[12px] font-medium">{children}</span>
  );
}
