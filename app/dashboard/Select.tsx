"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAnchoredPopover } from "./useAnchoredPopover";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T | "";
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** Shown when `value` matches no option. */
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  size?: "md" | "sm";
  capitalize?: boolean;
  disabled?: boolean;
  /** Applied to the root element. Use for width and margin. */
  className?: string;
  /** Applied to the trigger button. Use for typography overrides. */
  triggerClassName?: string;
};

const SIZES = {
  md: "px-3 py-2 text-[14px]",
  sm: "px-2.5 py-1.5 text-[13px]",
} as const;

function Chevron({ open }: { open: boolean }) {
  return (
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
  );
}

function Check() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-accent"
    >
      <path d="m2.5 6.5 2.5 2.5 4.5-5.5" />
    </svg>
  );
}

/**
 * Custom dropdown that replaces the native select.
 *
 * The list is a popover, so it renders in the top layer. That keeps it from
 * being clipped by `overflow` containers (tables) and lets it appear above
 * modal dialogs. Focus stays on the trigger and the active option is exposed
 * through aria-activedescendant, following the select-only combobox pattern.
 */
export default function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select...",
  id,
  "aria-label": ariaLabel,
  size = "md",
  capitalize,
  disabled,
  className = "",
  triggerClassName = "",
}: Props<T>) {
  const autoId = useId();
  const triggerId = id ?? `${autoId}-trigger`;
  const listId = `${autoId}-list`;
  const optionId = (i: number) => `${autoId}-opt-${i}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wasOpenOnPointerDown = useRef(false);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  function show() {
    if (disabled || options.length === 0) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  }

  useAnchoredPopover({
    open,
    onClose: () => setOpen(false),
    triggerRef,
    panelRef,
  });

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(optionId(active))
      ?.scrollIntoView({ block: "nearest" });
    // optionId is derived from autoId, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function typeahead(char: string) {
    const now = Date.now();
    const text =
      now - typed.current.at > 600 ? char : typed.current.text + char;
    typed.current = { text, at: now };
    const needle = text.toLowerCase();
    const from = open ? (text.length === 1 ? active + 1 : active) : 0;
    for (let i = 0; i < options.length; i++) {
      const idx = (from + i) % options.length;
      if (options[idx].label.toLowerCase().startsWith(needle)) return idx;
    }
    return -1;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
    const last = options.length - 1;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      } else if (e.key.length === 1) {
        const idx = typeahead(e.key);
        if (idx >= 0) {
          e.preventDefault();
          setActive(idx);
          setOpen(true);
        }
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(i + 1, last));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(last);
        break;
      case "PageDown":
        e.preventDefault();
        setActive((i) => Math.min(i + 5, last));
        break;
      case "PageUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 5, 0));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        // Stop the surrounding dialog from closing along with the list.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1) {
          const idx = typeahead(e.key);
          if (idx >= 0) {
            e.preventDefault();
            setActive(idx);
          }
        }
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onPointerDown={() => {
          // Light dismiss closes the list before click fires. Remember that,
          // so clicking the trigger of an open list closes it and stays closed.
          wasOpenOnPointerDown.current = open;
        }}
        onClick={(e) => {
          // Keyboard activation is handled in onKeyDown.
          if (e.detail === 0) return;
          if (wasOpenOnPointerDown.current) {
            wasOpenOnPointerDown.current = false;
            setOpen(false);
            return;
          }
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          // Prevents the synthetic click a released Space would produce.
          if (e.key === " ") e.preventDefault();
        }}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 border bg-surface text-left outline-none transition-colors focus-visible:border-ink disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? "border-ink" : "border-[#B8B8B2] hover:border-ink"
        } ${SIZES[size]} ${capitalize ? "capitalize" : ""} ${triggerClassName}`}
      >
        <span className={`truncate ${selected ? "" : "text-muted"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          popover="auto"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : triggerId}
          // Keep focus on the trigger while the pointer is over the list.
          onMouseDown={(e) => e.preventDefault()}
          className="animate-select-in m-0 overflow-y-auto border border-ink bg-surface p-0 py-1 text-ink shadow-lg motion-reduce:animate-none"
        >
          {options.map((o, i) => {
            const isSelected = i === selectedIndex;
            return (
              <div
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-between gap-4 whitespace-nowrap px-3 py-2 ${
                  size === "sm" ? "text-[13px]" : "text-[14px]"
                } ${capitalize ? "capitalize" : ""} ${
                  i === active ? "bg-accent-soft" : ""
                } ${isSelected ? "font-medium" : ""}`}
              >
                {o.label}
                {isSelected && <Check />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
