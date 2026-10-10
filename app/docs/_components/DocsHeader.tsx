"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/app/components/Logo";
import DocsSearch from "./Search";
import SidebarNav from "./SidebarNav";

const LINKS = [
  { href: "/docs", label: "Docs", match: (p: string) => p === "/docs" },
  {
    href: "/docs/quickstart",
    label: "Guides",
    match: (p: string) => p.startsWith("/docs/") && !p.startsWith("/docs/api/"),
  },
  {
    href: "/docs/api/overview",
    label: "API Reference",
    match: (p: string) => p.startsWith("/docs/api/"),
  },
];

export default function DocsHeader({ titles }: { titles: Record<string, string> }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  // Close the drawer after navigating (adjusting state during render).
  const [seen, setSeen] = useState(pathname);
  if (pathname !== seen) {
    setSeen(pathname);
    setDrawer(false);
  }

  useEffect(() => {
    if (!drawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => query.matches && setDrawer(false);
    window.addEventListener("keydown", onKey);
    query.addEventListener("change", onChange);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      query.removeEventListener("change", onChange);
    };
  }, [drawer]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-4 px-6">
          <button
            type="button"
            onClick={() => setDrawer((v) => !v)}
            aria-label={drawer ? "Close documentation menu" : "Open documentation menu"}
            aria-expanded={drawer}
            aria-controls="docs-drawer"
            className="-ml-2 flex h-9 w-9 items-center justify-center lg:hidden"
          >
            <span className="flex flex-col gap-[5px]">
              <span className={`h-px w-5 bg-ink transition-transform ${drawer ? "translate-y-[3px] rotate-45" : ""}`} />
              <span className={`h-px w-5 bg-ink transition-transform ${drawer ? "-translate-y-[3px] -rotate-45" : ""}`} />
            </span>
          </button>

          <Link href="/docs" aria-label="Keel documentation home" className="flex items-center gap-3">
            <Logo className="h-7" />
            <span className="hidden border-l border-border pl-3 text-[13px] font-medium text-muted sm:inline">
              Docs
            </span>
          </Link>

          <nav aria-label="Documentation sections" className="ml-4 hidden items-center gap-5 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={l.match(pathname) ? "page" : undefined}
                className={`text-[13px] font-medium transition-colors ${
                  l.match(pathname) ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <DocsSearch />
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center bg-ink px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-accent"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {drawer && (
        <div
          id="docs-drawer"
          className="fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto bg-background px-6 py-5 lg:hidden"
        >
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 border-b border-border pb-4 md:hidden">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-[14px] font-medium">
                {l.label}
              </Link>
            ))}
          </div>
          <SidebarNav titles={titles} onNavigate={() => setDrawer(false)} />
        </div>
      )}
    </>
  );
}
