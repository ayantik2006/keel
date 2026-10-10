"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CheckIcon, FolderIcon, PlusIcon, SearchIcon } from "./icons";
import type { Project } from "./types";
import { useAnchoredPopover } from "./useAnchoredPopover";

type Props = {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  /** Adds a "New project" action to the footer of the list. */
  onCreate?: () => void;
  /** Adds an "All projects" action to the footer of the list. */
  onViewAll?: () => void;
};

/** Search appears once the list is long enough to need it. */
const SEARCH_THRESHOLD = 6;

const AVATAR_TONES = [
  "bg-ink text-white",
  "bg-accent text-white",
  "bg-accent-soft text-accent",
  "bg-code text-ink",
] as const;

/** A stable tone per project, so each one is recognisable at a glance. */
function toneFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function Avatar({ project, size }: { project: Project; size: "md" | "sm" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-semibold uppercase ${toneFor(
        project.id,
      )} ${size === "md" ? "h-8 w-8 text-[14px]" : "h-7 w-7 text-[13px]"}`}
    >
      {project.name.trim().charAt(0) || "?"}
    </span>
  );
}

const secretTotal = (p: Project) =>
  Object.values(p.secretCounts).reduce((sum, n) => sum + n, 0);

const meta = (p: Project) => {
  const n = secretTotal(p);
  return `${p.role.charAt(0).toUpperCase()}${p.role.slice(1)} · ${n} secret${n === 1 ? "" : "s"}`;
};

function Chevrons() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-muted"
    >
      <path d="m4.5 6.5 3.5-3.5 3.5 3.5M4.5 9.5 8 13l3.5-3.5" />
    </svg>
  );
}

/**
 * Project switcher shared by the Secrets, Integrations and Settings pages.
 *
 * The trigger shows the current project. The list opens in the top layer with
 * search (for longer lists), a role and secret count per project, and quick
 * actions to see every project or create one.
 */
export default function ProjectSelect({
  projects,
  value,
  onChange,
  onCreate,
  onViewAll,
}: Props) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (id: string) => `${uid}-opt-${id}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wasOpenOnPointerDown = useRef(false);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const current = projects.find((p) => p.id === value) ?? projects[0];
  const searchable = projects.length >= SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  // Fall back to the first match when the active row is filtered out.
  const active =
    visible.find((p) => p.id === activeId)?.id ?? visible[0]?.id ?? null;

  function openList() {
    setQuery("");
    setActiveId(current?.id ?? null);
    setOpen(true);
    // Focus moves into the panel once it is mounted.
    requestAnimationFrame(() => {
      (searchRef.current ?? listRef.current)?.focus({ preventScroll: true });
      if (current) {
        document
          .getElementById(optionId(current.id))
          ?.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function choose(id: string) {
    if (id !== value) onChange(id);
    close();
  }

  useAnchoredPopover({
    open,
    onClose: () => setOpen(false),
    triggerRef,
    panelRef,
    width: 320,
  });

  function move(delta: number | "first" | "last") {
    if (visible.length === 0) return;
    const i = visible.findIndex((p) => p.id === active);
    const next =
      delta === "first"
        ? 0
        : delta === "last"
          ? visible.length - 1
          : Math.min(Math.max(i + delta, 0), visible.length - 1);
    const id = visible[next].id;
    setActiveId(id);
    document.getElementById(optionId(id))?.scrollIntoView({ block: "nearest" });
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    // Footer buttons keep their normal Enter and Space behaviour.
    const onFooter = (e.target as HTMLElement).closest("[data-footer]");
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        if (searchable && e.target === searchRef.current) break;
        e.preventDefault();
        move("first");
        break;
      case "End":
        if (searchable && e.target === searchRef.current) break;
        e.preventDefault();
        move("last");
        break;
      case "Enter":
        if (onFooter || !active) break;
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        // Close only the list, not a surrounding dialog.
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
    }
  }

  if (!current) return null;

  const rowBase = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px]";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${uid}-panel` : undefined}
        aria-label={`Project: ${current.name}. Switch project`}
        onPointerDown={() => {
          // Light dismiss runs before click, so remember the state at press.
          wasOpenOnPointerDown.current = open;
        }}
        onClick={() => {
          if (wasOpenOnPointerDown.current) {
            wasOpenOnPointerDown.current = false;
            setOpen(false);
            return;
          }
          if (open) close(false);
          else openList();
        }}
        className={`group flex min-w-60 max-w-full cursor-pointer items-center gap-3 border bg-surface py-1.5 pl-1.5 pr-3 text-left outline-none transition-colors focus-visible:border-ink ${
          open ? "border-ink" : "border-[#B8B8B2] hover:border-ink"
        }`}
      >
        <Avatar project={current} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight">
            {current.name}
          </span>
          <span className="block truncate text-[12px] leading-tight text-muted">
            {meta(current)}
          </span>
        </span>
        <Chevrons />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={`${uid}-panel`}
          role="dialog"
          aria-label="Switch project"
          popover="auto"
          onKeyDown={onPanelKeyDown}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && !panelRef.current?.contains(next) && next !== triggerRef.current) {
              setOpen(false);
            }
          }}
          className="animate-select-in m-0 flex flex-col overflow-hidden border border-ink bg-surface p-0 text-ink shadow-xl motion-reduce:animate-none"
        >
          {searchable && (
            <div className="relative border-b border-border">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={active ? optionId(active) : undefined}
                aria-label="Search projects"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                className="w-full bg-transparent py-2.5 pl-9 pr-3 text-[14px] outline-none placeholder:text-muted/70"
              />
            </div>
          )}

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Projects"
            tabIndex={searchable ? -1 : 0}
            aria-activedescendant={!searchable && active ? optionId(active) : undefined}
            // Keep focus where it is while the pointer moves over rows.
            onMouseDown={(e) => e.preventDefault()}
            className="min-h-0 flex-1 overflow-y-auto py-1 outline-none"
          >
            {visible.map((p) => {
              const isCurrent = p.id === current.id;
              return (
                <li
                  key={p.id}
                  id={optionId(p.id)}
                  role="option"
                  aria-selected={isCurrent}
                  onMouseMove={() => active !== p.id && setActiveId(p.id)}
                  onClick={() => choose(p.id)}
                  className={`${rowBase} cursor-pointer ${p.id === active ? "bg-code" : ""}`}
                >
                  <Avatar project={p} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[14px] ${isCurrent ? "font-semibold" : "font-medium"}`}
                    >
                      {p.name}
                    </span>
                    <span className="block truncate text-[12px] text-muted">{meta(p)}</span>
                  </span>
                  {isCurrent && <CheckIcon className="shrink-0 text-accent" />}
                </li>
              );
            })}
            {visible.length === 0 && (
              <li role="presentation" className="px-3 py-6 text-center text-[13px] text-muted">
                No projects match &ldquo;{query.trim()}&rdquo;
              </li>
            )}
          </ul>

          {(onViewAll || onCreate) && (
            <div data-footer className="border-t border-border bg-code/40 p-1">
              {onViewAll && (
                <button
                  type="button"
                  onClick={() => {
                    close(false);
                    onViewAll();
                  }}
                  className={`${rowBase} text-muted transition-colors hover:bg-code hover:text-ink`}
                >
                  <FolderIcon />
                  All projects
                </button>
              )}
              {onCreate && (
                <button
                  type="button"
                  onClick={() => {
                    close(false);
                    onCreate();
                  }}
                  className={`${rowBase} text-muted transition-colors hover:bg-code hover:text-ink`}
                >
                  <PlusIcon />
                  New project
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
