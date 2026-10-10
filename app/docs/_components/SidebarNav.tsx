"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, docPath } from "@/lib/docs/nav";

/** Collapsible documentation navigation. Open state starts at the current page's group. */
export default function SidebarNav({
  titles,
  onNavigate,
}: {
  titles: Record<string, string>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const currentGroup = NAV.find((s) => s.pages.some((p) => docPath(p) === pathname))?.id;
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(currentGroup ? [currentGroup] : [NAV[0].id]),
  );
  // Following a link into another group opens it (adjusting state during render).
  const [seenGroup, setSeenGroup] = useState(currentGroup);
  if (currentGroup !== seenGroup) {
    setSeenGroup(currentGroup);
    if (currentGroup && !open.has(currentGroup))
      setOpen(new Set([...open, currentGroup]));
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <nav aria-label="Documentation" className="text-[14px]">
      <Link
        href="/docs"
        onClick={onNavigate}
        aria-current={pathname === "/docs" ? "page" : undefined}
        className={`mb-3 block px-2 py-1.5 font-medium ${
          pathname === "/docs" ? "text-ink" : "text-muted hover:text-ink"
        }`}
      >
        Overview
      </Link>
      {NAV.map((section) => {
        const isOpen = open.has(section.id);
        const panelId = `nav-${section.id}`;
        return (
          <div key={section.id} className="mb-1">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {section.title}
              <span
                aria-hidden="true"
                className={`text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
              >
                &rsaquo;
              </span>
            </button>
            {isOpen && (
              <ul id={panelId} className="mb-3 border-l border-border">
                {section.pages.map((slug) => {
                  const href = docPath(slug);
                  const active = pathname === href;
                  return (
                    <li key={slug}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={`-ml-px block border-l py-1.5 pl-3 pr-2 ${
                          active
                            ? "border-accent font-medium text-ink"
                            : "border-transparent text-muted hover:border-ink hover:text-ink"
                        }`}
                      >
                        {titles[slug] ?? slug}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
