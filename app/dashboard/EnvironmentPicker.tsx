"use client";

import { useId, useRef, useState } from "react";
import { useAnchoredPopover } from "./useAnchoredPopover";

type Props = {
  options: readonly { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Replaces the trigger text and prevents opening, such as for admins. */
  lockedLabel?: string;
  "aria-label": string;
  className?: string;
};

/**
 * Multi-select for environments. The list is a popover with one checkbox per
 * option, so it stays out of the way of the form it sits in.
 */
export default function EnvironmentPicker({
  options,
  value,
  onChange,
  lockedLabel,
  "aria-label": ariaLabel,
  className = "",
}: Props) {
  const uid = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenOnPointerDown = useRef(false);
  const [open, setOpen] = useState(false);

  const locked = lockedLabel !== undefined;

  useAnchoredPopover({
    open,
    onClose: () => setOpen(false),
    triggerRef,
    panelRef,
  });

  const selected = options.filter((o) => value.includes(o.value));
  const summary = locked
    ? lockedLabel
    : selected.length === 0
      ? "No environments"
      : selected.length === options.length && options.length > 1
        ? "All environments"
        : selected.length === 1
          ? selected[0].label
          : `${selected.length} environments`;

  function toggle(v: string) {
    onChange(
      value.includes(v) ? value.filter((x) => x !== v) : [...value, v],
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={locked}
        aria-label={`${ariaLabel}: ${summary}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${uid}-panel` : undefined}
        onPointerDown={() => {
          wasOpenOnPointerDown.current = open;
        }}
        onClick={() => {
          if (wasOpenOnPointerDown.current) {
            wasOpenOnPointerDown.current = false;
            setOpen(false);
            return;
          }
          if (open) {
            setOpen(false);
            return;
          }
          setOpen(true);
          requestAnimationFrame(() =>
            panelRef.current?.querySelector<HTMLInputElement>("input")?.focus(),
          );
        }}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 border bg-surface px-3 py-2 text-left text-[14px] outline-none transition-colors focus-visible:border-ink disabled:cursor-not-allowed disabled:bg-code/60 disabled:text-muted ${
          open ? "border-ink" : "border-[#B8B8B2] enabled:hover:border-ink"
        }`}
      >
        <span
          className={`truncate ${!locked && selected.length === 0 ? "text-muted" : ""}`}
        >
          {summary}
        </span>
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-muted transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>

      {open && !locked && (
        <div
          ref={panelRef}
          id={`${uid}-panel`}
          role="dialog"
          aria-label={ariaLabel}
          popover="auto"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
          className="animate-select-in m-0 overflow-y-auto border border-ink bg-surface p-0 py-1 text-ink shadow-lg motion-reduce:animate-none"
        >
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-3 whitespace-nowrap px-3 py-2 text-[14px] hover:bg-code"
            >
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="h-4 w-4 accent-accent"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
