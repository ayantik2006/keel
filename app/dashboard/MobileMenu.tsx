"use client";

import Link from "next/link";
import { Logo } from "../components/Logo";
import { HomeIcon } from "./icons";
import { useEffect, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";

type Item<T extends string> = {
  id: T;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

type Props<T extends string> = {
  items: readonly Item<T>[];
  current: T;
  onNavigate: (id: T) => void;
};

const svg = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/**
 * Top bar for small screens. The primary navigation lives in a drawer opened
 * from the hamburger button. The drawer is a modal dialog, so focus is
 * trapped, Escape closes it, and the page behind it is inert.
 */
export default function MobileMenu<T extends string>({
  items,
  current,
  onNavigate,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Keep the page from scrolling behind the drawer.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // The drawer has no purpose once the desktop sidebar is showing.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => query.matches && setOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  function close() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface md:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-1">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center text-ink transition-colors hover:bg-code"
          >
            <svg {...svg}>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Link href="/" aria-label="Keel home" className="flex"><Logo className="h-7" /></Link>
        </div>
        <div className="pr-2">
          <UserButton />
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-label="Menu"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="animate-drawer-in m-0 mr-auto h-dvh max-h-none w-72 max-w-[85vw] border-r border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40 motion-reduce:animate-none"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-5 pr-2">
            <Link href="/" aria-label="Keel home" className="flex"><Logo className="h-7" /></Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center text-muted transition-colors hover:bg-code hover:text-ink"
            >
              <svg {...svg}>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {items.map(({ id, label, Icon }) => {
              const active = id === current;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onNavigate(id);
                    close();
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-3 px-3 py-3 text-left text-[15px] transition-colors ${
                    active
                      ? "bg-accent-soft font-medium text-ink"
                      : "text-muted hover:bg-code hover:text-ink"
                  }`}
                >
                  <Icon className={active ? "text-accent" : ""} />
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-border p-3">
            <Link
              href="/"
              className="flex w-full items-center gap-3 px-3 py-3 text-[15px] text-muted transition-colors hover:bg-code hover:text-ink"
            >
              <HomeIcon />
              Back to home
            </Link>
          </div>
        </div>
      </dialog>
    </header>
  );
}
