"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import Select from "./Select";
import { dateFormat, type AuditEvent, type Member } from "./types";

const LABELS: Record<string, string> = {
  "project.created": "Project created",
  "project.updated": "Project updated",
  "project.deleted": "Project deleted",
  "member.role_changed": "Role changed",
  "member.removed": "Member removed",
  "member.left": "Member left",
  "invitation.created": "Invitation sent",
  "invitation.revoked": "Invitation revoked",
  "invitation.accepted": "Invitation accepted",
  "environment.access_granted": "Environment access granted",
  "environment.access_revoked": "Environment access revoked",
  "environment.access_denied": "Environment access denied",
  "secret.created": "Secret created",
  "secret.updated": "Secret updated",
  "secret.deleted": "Secret deleted",
  "secret.revealed": "Secret value viewed",
  "secret.version_revealed": "Old version viewed",
  "secret.rolled_back": "Secret rolled back",
  "secrets.exported": "Secrets exported",
  "secrets.imported": "Secrets imported",
  "integration.connected": "Vercel connected",
  "integration.updated": "Vercel settings changed",
  "integration.disconnected": "Vercel disconnected",
  "integration.synced": "Vercel sync",
  "integration.deploy_triggered": "Vercel redeploy triggered",
};

const CATEGORY_OPTIONS = [
  { value: "", label: "All events" },
  { value: "secrets", label: "Secrets" },
  { value: "access", label: "Members and access" },
  { value: "project", label: "Project" },
  { value: "integrations", label: "Integrations" },
];

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** A short human description from metadata. Metadata never holds secret values. */
function detail(e: AuditEvent): string {
  const m = e.metadata;
  const parts: string[] = [];
  if (m.key) parts.push(String(m.key));
  if (m.environment) parts.push(`in ${str(m.environment)}`);
  if (m.fromName && m.toName) parts.push(`${str(m.fromName)} to ${str(m.toName)}`);
  if (m.name && e.action === "project.deleted") parts.push(str(m.name));
  if (m.from && m.to) parts.push(`${str(m.from)} to ${str(m.to)}`);
  else if (m.role) parts.push(str(m.role));
  if (m.email) parts.push(str(m.email));
  if (m.version !== undefined && e.action !== "secret.created")
    parts.push(`v${str(m.version)}`);
  if (m.restoredFromVersion !== undefined)
    parts.push(`restored from v${str(m.restoredFromVersion)}`);
  if (m.count !== undefined) parts.push(`${str(m.count)} secrets`);
  if (e.action === "secrets.imported")
    parts.push(
      `${str(m.created)} created, ${str(m.updated)} overwritten, ${str(m.skipped)} skipped, ${str(m.failed)} failed`,
    );
  if (e.action === "integration.synced")
    parts.push(
      `${str(m.status)}: ${str(m.created)} created, ${str(m.updated)} updated, ${str(m.deleted)} deleted, ${str(m.conflicts)} conflicts, ${str(m.failed)} failed`,
    );
  if (m.vercelProject) parts.push(str(m.vercelProject));
  if (m.via === "cli") parts.push("via CLI");
  return parts.join(" · ");
}

const ghost =
  "border border-[#B8B8B2] px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-ink disabled:opacity-60";

type Filters = { category: string; actor: string; from: string; to: string };
const NO_FILTERS: Filters = { category: "", actor: "", from: "", to: "" };

const fieldLabel = "block text-[12px] font-medium text-muted";

const dateInput =
  "block w-full border border-[#B8B8B2] bg-surface px-2.5 py-1.5 text-[13px] outline-none transition-colors hover:border-ink focus:border-ink";

export default function AuditLog({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [people, setPeople] = useState<Member[]>([]);
  const [state, setState] = useState<{
    key: string;
    events: AuditEvent[];
    nextCursor: string | null;
    error?: string;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${projectId}:${JSON.stringify(filters)}:${tick}`;
  const ready = state !== null && state.key === key;
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const badRange = Boolean(filters.from && filters.to && filters.from > filters.to);

  useEffect(() => {
    let alive = true;
    api
      .listMembers(projectId)
      .then((m) => alive && setPeople(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (badRange) return;
    let alive = true;
    api
      .listAudit(projectId, filters)
      .then((r) => alive && setState({ key, ...r }))
      .catch(
        (err) =>
          alive &&
          setState({ key, events: [], nextCursor: null, error: errorMessage(err) }),
      );
    return () => {
      alive = false;
    };
  }, [projectId, filters, key, badRange]);

  async function more() {
    if (!ready || !state.nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await api.listAudit(projectId, { ...filters, cursor: state.nextCursor });
      setState((s) =>
        s && s.key === key
          ? { key, events: [...s.events, ...r.events], nextCursor: r.nextCursor }
          : s,
      );
    } catch (err) {
      setState((s) => (s ? { ...s, error: errorMessage(err) } : s));
    } finally {
      setLoadingMore(false);
    }
  }

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const actorOptions = [
    { value: "", label: "Anyone" },
    ...people.map((m) => ({
      value: m.userId,
      label: m.name ?? m.email ?? `User ${m.userId.slice(-6)}`,
    })),
  ];

  const summary = badRange
    ? null
    : !ready
      ? "Loading events..."
      : state.error
        ? null
        : `${state.events.length}${state.nextCursor ? "+" : ""} ${
            state.events.length === 1 ? "event" : "events"
          }${filtering ? " match" : ""}`;

  return (
    <div className="border border-border bg-surface">
      <div className="border-b border-border bg-code/40 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={fieldLabel}>Category</label>
            <Select
              aria-label="Category"
              value={filters.category}
              onChange={(v) => set({ category: v })}
              options={CATEGORY_OPTIONS}
              size="sm"
              className="mt-1.5 w-full"
            />
          </div>
          <div>
            <label className={fieldLabel}>Actor</label>
            <Select
              aria-label="Actor"
              value={filters.actor}
              onChange={(v) => set({ actor: v })}
              options={actorOptions}
              size="sm"
              className="mt-1.5 w-full"
            />
          </div>
          <div>
            <label htmlFor="audit-from" className={fieldLabel}>From</label>
            <input
              id="audit-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => set({ from: e.target.value })}
              className={`${dateInput} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor="audit-to" className={fieldLabel}>To</label>
            <input
              id="audit-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => set({ to: e.target.value })}
              className={`${dateInput} mt-1.5`}
            />
          </div>
        </div>

        <div className="mt-3 flex min-h-7 items-center justify-between gap-3">
          <p className="text-[12px] text-muted" aria-live="polite">
            {summary}
          </p>
          <div className="flex items-center gap-4">
            {filtering && (
              <button
                onClick={() => setFilters(NO_FILTERS)}
                className="text-[12px] font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Clear filters
              </button>
            )}
            <button onClick={() => setTick((n) => n + 1)} className={ghost}>
              Refresh
            </button>
          </div>
        </div>
        {badRange && (
          <p role="alert" className="mt-2 text-[13px] text-red-600">
            The start date must be before the end date.
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-code/60 text-[12px] uppercase tracking-wider text-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">When</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Who</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Event</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {!ready && !badRange && (
              <tr aria-hidden="true">
                <td colSpan={4} className="px-4 py-3">
                  <div className="h-5 animate-pulse bg-code" />
                </td>
              </tr>
            )}
            {ready &&
              state.events.map((e) => (
                <tr key={e.id} className="border-b border-border align-top last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-muted">
                    {dateFormat.format(new Date(e.at))}
                  </td>
                  <td className="px-4 py-2.5 text-[13px]">
                    {e.actor.isYou
                      ? "You"
                      : (e.actor.email ??
                        (e.actor.isMember
                          ? `User ${e.actor.userId.slice(-6)}`
                          : "Former member"))}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] font-medium">
                    {LABELS[e.action] ?? e.action}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted">{detail(e)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {ready && state.error && (
          <p role="alert" className="px-4 py-6 text-center text-[13px] text-red-600">
            {state.error}
          </p>
        )}
        {ready && !state.error && state.events.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-muted">
            {filtering
              ? "No events match these filters."
              : "No events have been recorded yet."}
          </p>
        )}
      </div>

      {ready && state.nextCursor && (
        <div className="border-t border-border px-4 py-3 text-center">
          <button onClick={more} disabled={loadingMore} className={ghost}>
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
