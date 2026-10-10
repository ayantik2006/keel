"use client";

import { useMemo, useState } from "react";
import { dateFormat, hasPermission, type Project } from "./types";
import {
  FolderIcon,
  GearIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./icons";

type Props = {
  projects: Project[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRename: (project: Project) => void;
  onDelete: (project: Project) => void;
  onSettings: (project: Project) => void;
};

export default function ProjectsView({
  projects,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onSettings,
}: Props) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const secretCount = (p: Project) =>
    Object.values(p.secretCounts).reduce((n, c) => n + c, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-[14px] text-muted">
            Each project holds its own secrets across environments.
          </p>
        </div>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent"
        >
          <PlusIcon />
          Create Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="mt-8 border border-dashed border-[#B8B8B2] bg-surface px-6 py-16 text-center">
          <FolderIcon className="mx-auto h-6 w-6 text-muted" />
          <p className="mt-3 text-[15px] font-medium">No projects yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
            Create your first project to start organizing secrets by
            environment.
          </p>
          <button
            onClick={onCreate}
            className="mt-4 inline-flex items-center gap-1.5 bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent"
          >
            <PlusIcon />
            Create Project
          </button>
        </div>
      ) : (
        <>
          <div className="relative mt-6 max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search projects by name"
              placeholder="Search projects"
              className="w-full border border-[#B8B8B2] bg-surface py-2 pl-9 pr-3 text-[14px] outline-none placeholder:text-muted/70 focus:border-ink"
            />
          </div>

          {visible.length === 0 ? (
            <div className="mt-4 border border-border bg-surface px-6 py-14 text-center">
              <p className="text-[15px] font-medium">No projects match</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
                No project name contains &ldquo;{query.trim()}&rdquo;.
              </p>
              <button
                onClick={() => setQuery("")}
                className="mt-4 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
              >
                Clear search
              </button>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {visible.map((p) => {
                return (
                  <li
                    key={p.id}
                    className="relative flex flex-col border border-border bg-surface p-5 transition-colors focus-within:border-ink hover:border-[#B8B8B2]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 text-[16px] font-semibold tracking-tight">
                        <button
                          onClick={() => onOpen(p.id)}
                          className="block max-w-full truncate text-left outline-none after:absolute after:inset-0"
                        >
                          {p.name}
                        </button>
                      </h2>
                      <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted">
                        {p.role}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-[2.75rem] text-[13px] leading-relaxed text-muted">
                      {p.description ?? "No description"}
                    </p>
                    <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
                      <div>
                        <dt className="inline">Environments </dt>
                        <dd className="inline font-mono text-ink">
                          {p.environments.length}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Secrets </dt>
                        <dd className="inline font-mono text-ink">
                          {secretCount(p)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="text-[12px] text-muted">
                        Updated {dateFormat.format(new Date(p.updatedAt))}
                      </span>
                      <div className="relative z-10 flex gap-1">
                        <ActionButton
                          label={`Settings and members for ${p.name}`}
                          onClick={() => onSettings(p)}
                        >
                          <GearIcon />
                        </ActionButton>
                        {hasPermission(p, "project:update") && (
                          <ActionButton
                            label={`Rename ${p.name}`}
                            onClick={() => onRename(p)}
                          >
                            <PencilIcon />
                          </ActionButton>
                        )}
                        {hasPermission(p, "project:delete") && (
                          <ActionButton
                            label={`Delete ${p.name}`}
                            danger
                            onClick={() => onDelete(p)}
                          >
                            <TrashIcon />
                          </ActionButton>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 text-[12px] text-muted" aria-live="polite">
            Showing {visible.length} of {projects.length} projects.
          </p>
        </>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-code ${
        danger ? "hover:text-red-600" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
