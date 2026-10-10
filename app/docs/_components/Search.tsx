"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchEntry } from "@/lib/docs/load";
import { searchDocs } from "@/lib/docs/search";

type Status = "idle" | "loading" | "ready" | "error";

const isTypingTarget = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  );
};

export default function DocsSearch() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const listId = useId();

  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const load = useCallback(async () => {
    if (entries || status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch("/docs/search-index.json");
      if (!res.ok) throw new Error("bad response");
      setEntries((await res.json()) as SearchEntry[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [entries, status]);

  const open = useCallback(() => {
    if (dialog.current?.open) return;
    opener.current = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    input.current?.focus();
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target);
      if (combo || slash) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo(
    () => (entries ? searchDocs(entries, query) : []),
    [entries, query],
  );

  function go(index: number) {
    const r = results[index];
    if (!r) return;
    dialog.current?.close();
    router.push(r.entry.path + (r.entry.anchor ? `#${r.entry.anchor}` : ""));
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(active);
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const trimmed = query.trim();

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Search documentation"
        aria-keyshortcuts="Control+K Meta+K /"
        className="flex h-9 items-center gap-2 border border-border bg-background px-3 text-[13px] text-muted transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.75" />
          <path d="M10.5 10.5 14 14" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Search docs</span>
        <kbd className="hidden border border-border px-1.5 font-mono text-[11px] sm:inline">
          Ctrl K
        </kbd>
      </button>

      <dialog
        ref={dialog}
        aria-label="Search documentation"
        onClose={() => {
          setQuery("");
          setActive(0);
          opener.current?.focus();
        }}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-0 mx-auto mt-[10vh] w-[min(40rem,calc(100vw-2rem))] border border-border bg-background p-0 text-ink backdrop:bg-black/30"
      >
        <div className="border-b border-border">
          <label htmlFor={`${listId}-input`} className="sr-only">
            Search the documentation
          </label>
          <input
            id={`${listId}-input`}
            ref={input}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={results.length ? optionId(active) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search titles, headings and content"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            className="w-full bg-transparent px-4 py-3.5 text-[15px] outline-none placeholder:text-muted"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto" aria-live="polite">
          {status === "loading" && (
            <p className="px-4 py-6 text-[14px] text-muted">Loading the search index...</p>
          )}
          {status === "error" && (
            <p className="px-4 py-6 text-[14px] text-muted">
              Search could not load. Check your connection and try again.
            </p>
          )}
          {status === "ready" && !trimmed && (
            <p className="px-4 py-6 text-[14px] text-muted">
              Type to search. Use the arrow keys to move and Enter to open a result.
            </p>
          )}
          {status === "ready" && trimmed && results.length === 0 && (
            <div className="px-4 py-6 text-[14px] text-muted">
              <p>
                No results for <span className="font-medium text-ink">&ldquo;{trimmed}&rdquo;</span>.
              </p>
              <p className="mt-1">
                Try fewer or different words, such as an environment name, a CLI command or an error message.
              </p>
            </div>
          )}
          {results.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Search results">
              {results.map((r, i) => (
                <li
                  key={`${r.entry.path}#${r.entry.anchor}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(i)}
                  className={`cursor-pointer border-b border-border px-4 py-3 last:border-b-0 ${
                    i === active ? "bg-code" : ""
                  }`}
                >
                  <p className="text-[12px] text-muted">
                    {r.entry.section} / {r.entry.title}
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium">
                    {r.entry.heading || r.entry.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">
                    {r.snippet.map((s, j) =>
                      s.mark ? (
                        <mark key={j} className="bg-accent-soft text-ink">
                          {s.text}
                        </mark>
                      ) : (
                        <span key={j}>{s.text}</span>
                      ),
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}
