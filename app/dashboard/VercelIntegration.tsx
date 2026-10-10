"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import { ConfirmDeleteDialog } from "./Dialogs";
import Select from "./Select";
import {
  Card,
  Field,
  Row,
  Rows,
  ghostButton,
  inputClass,
  primaryButton,
} from "./SettingsUI";
import { dateFormat, envLabel, type VercelStatus } from "./types";

type Props = { projectId: string; flash: (message: string) => void };

const TARGETS = ["development", "preview", "production"] as const;
const TARGET_OPTIONS = [
  { value: "", label: "Do not sync" },
  ...TARGETS.map((t) => ({ value: t as string, label: t })),
];
const POLICY_OPTIONS: { value: "skip" | "overwrite"; label: string }[] = [
  { value: "skip", label: "Leave it alone and report a conflict (safe)" },
  { value: "overwrite", label: "Take it over and overwrite its value" },
];
const DEFAULT_MAP: Record<string, string> = {
  development: "development",
  staging: "preview",
  production: "production",
};

type Options = {
  teams: { id: string; name: string }[];
  projects: { id: string; name: string }[];
};

export default function VercelIntegration({ projectId, flash }: Props) {
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<{ tick: number; status?: VercelStatus; error?: string } | null>(null);
  const status = loaded?.tick === tick ? loaded.status : undefined;
  const ready = loaded?.tick === tick;
  const conn = status && status.connected ? status : null;

  const [token, setToken] = useState("");
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const [options, setOptions] = useState<Options | null>(null);
  const [project, setProject] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [autoRedeploy, setAutoRedeploy] = useState(false);
  const [hook, setHook] = useState("");
  const [policy, setPolicy] = useState<"skip" | "overwrite">("skip");
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .vercelStatus(projectId)
      .then((s) => alive && setLoaded({ tick, status: s }))
      .catch((e) => alive && setLoaded({ tick, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [projectId, tick]);

  // Poll while a sync or deployment is in flight.
  const live =
    status?.connected &&
    (status.syncing || (status.lastDeployment && !["READY", "ERROR", "CANCELED"].includes(status.lastDeployment.state)));
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => setTick((n) => n + 1), 5000);
    return () => clearTimeout(t);
  }, [live, tick]);

  const reload = () => setTick((n) => n + 1);

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run("connect", () => api.vercelConnect(projectId, { token, teamId: teamId || undefined }));
    if (ok) {
      setToken(""); // the token is not kept in the browser
      flash("Vercel connected");
      reload();
    }
  }

  async function beginEdit() {
    setEditing(true);
    setOptions(null);
    const o = await run("options", () => api.vercelOptions(projectId, conn?.teamId ?? undefined));
    if (!o) return;
    setOptions(o);
    setProject(conn?.vercelProjectId ?? "");
    const base =
      conn && Object.keys(conn.mappings).length > 0
        ? conn.mappings
        : Object.fromEntries(
            (conn?.environments ?? []).filter((s) => s in DEFAULT_MAP).map((s) => [s, DEFAULT_MAP[s]]),
          );
    setMappings(base);
    setAutoRedeploy(conn?.autoRedeploy ?? false);
    setPolicy(conn?.conflictPolicy ?? "skip");
    setHook("");
  }

  async function save() {
    const out = await run("save", () =>
      api.vercelConfigure(projectId, {
        vercelProjectId: project,
        teamId: conn?.teamId ?? undefined,
        mappings: Object.fromEntries(Object.entries(mappings).filter(([, t]) => t)),
        autoRedeploy,
        conflictPolicy: policy,
        ...(hook.trim() ? { deployHookUrl: hook.trim() } : {}),
      }),
    );
    if (out) {
      setEditing(false);
      flash("Vercel settings saved");
      reload();
    }
  }

  async function sync(redeploy: boolean) {
    const out = await run(redeploy ? "redeploy" : "sync", () => api.vercelSync(projectId, redeploy));
    if (out) {
      const s = out.summary;
      setLastResult(
        `${s.status === "success" ? "Synced" : s.status === "partial" ? "Partly synced" : "Sync failed"}: ${s.created} created, ${s.updated} updated, ${s.deleted} deleted, ${s.unchanged} unchanged` +
          (s.conflicts.length ? `, ${s.conflicts.length} conflicts` : "") +
          (s.failed.length ? `, ${s.failed.length} failed` : "") +
          (s.deployment === "triggered" ? ". Redeploy started." : s.deploymentReason ? `. ${s.deploymentReason}` : "."),
      );
      reload();
    } else reload();
  }

  async function disconnect(): Promise<string | null> {
    try {
      await api.vercelDisconnect(projectId);
      flash("Vercel disconnected");
      reload();
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }

  const connected = ready && status?.connected ? status : null;

  const statusBadge = connected ? (
    <span className="inline-flex items-center gap-2 text-[12px] font-medium">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          connected.status === "active"
            ? "bg-emerald-500"
            : connected.status === "attention"
              ? "bg-red-500"
              : "bg-accent"
        }`}
      />
      {connected.status === "active"
        ? "Connected"
        : connected.status === "attention"
          ? "Needs attention"
          : "No project linked"}
    </span>
  ) : undefined;

  const mark = (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center bg-ink text-white"
    >
      <svg width="14" height="12" viewBox="0 0 76 65" fill="currentColor">
        <path d="M37.59.25l36.95 64H.64l36.95-64z" />
      </svg>
    </span>
  );

  const banner = (kind: "error" | "info", text: string) => (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`mx-5 mt-5 px-3 py-2 text-[13px] ${
        kind === "error" ? "bg-red-50 text-red-700" : "bg-accent-soft"
      }`}
    >
      {text}
    </p>
  );

  const cardProps = {
    title: "Vercel",
    description: "Sync secrets to Vercel environment variables.",
    icon: mark,
    action: statusBadge,
  };

  const loadError = ready ? loaded?.error : undefined;

  return (
    <div>
      {!ready && (
        <Card {...cardProps}>
          <div className="space-y-3 px-5 py-5">
            <div className="h-5 w-1/3 animate-pulse bg-code" />
            <div className="h-10 animate-pulse bg-code" />
          </div>
        </Card>
      )}

      {loadError && (
        <Card {...cardProps}>
          {banner("error", loadError)}
          <div className="h-5" />
        </Card>
      )}

      {ready && status && !status.connected && (
        <form onSubmit={connect}>
          <Card
            {...cardProps}
            footer={
              <>
                <p className="text-[12px] text-muted">
                  Stored encrypted. Never sent back to your browser.
                </p>
                <button
                  type="submit"
                  disabled={busy === "connect" || token.trim().length < 8}
                  className={primaryButton}
                >
                  {busy === "connect" ? "Checking token..." : "Connect Vercel"}
                </button>
              </>
            }
          >
            {error && banner("error", error)}
            <div className="space-y-5 px-5 py-5">
              <Field
                id="vercel-token"
                label="Access token"
                hint="Create one at vercel.com/account/tokens."
              >
                <input
                  id="vercel-token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  aria-describedby="vercel-token-help"
                  placeholder="Paste your access token"
                  className={inputClass}
                />
              </Field>
              <Field
                id="vercel-team"
                label="Team ID"
                optional
                hint="Only needed for projects owned by a team."
              >
                <input
                  id="vercel-team"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  aria-describedby="vercel-team-help"
                  placeholder="team_xxxxxxxx"
                  className={inputClass}
                />
              </Field>
            </div>
          </Card>
        </form>
      )}

      {connected && (
        <Card
          {...cardProps}
          footer={
            editing ? (
              <>
                <span />
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className={ghostButton}>
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={!project || busy === "save"}
                    className={primaryButton}
                  >
                    {busy === "save" ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  className="text-[13px] font-medium text-red-600 transition-colors hover:text-red-700"
                >
                  Disconnect
                </button>
                <div className="flex flex-wrap gap-2">
                  {connected.status === "attention" ? (
                    <button
                      onClick={async () => {
                        await run("x", () => api.vercelDisconnect(projectId));
                        reload();
                      }}
                      className={primaryButton}
                    >
                      Reconnect
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={beginEdit}
                        disabled={busy !== null}
                        className={ghostButton}
                      >
                        {connected.vercelProjectId ? "Edit settings" : "Choose project"}
                      </button>
                      {connected.vercelProjectId && (
                        <>
                          <button
                            onClick={() => sync(false)}
                            disabled={busy !== null || connected.syncing}
                            className={ghostButton}
                          >
                            {busy === "sync" ? "Syncing..." : "Sync now"}
                          </button>
                          <button
                            onClick={() => sync(true)}
                            disabled={busy !== null || connected.syncing || !connected.hookConfigured}
                            title={
                              connected.hookConfigured
                                ? undefined
                                : "Add a deploy hook to enable redeploys"
                            }
                            className={primaryButton}
                          >
                            {busy === "redeploy" ? "Syncing..." : "Sync & redeploy"}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            )
          }
        >
          {error && banner("error", error)}
          {!error &&
            connected.status === "attention" &&
            banner(
              "error",
              `${connected.lastError ?? "Vercel rejected the token."} Reconnect with a new token.`,
            )}
          {lastResult && !editing && banner("info", lastResult)}

          {!editing && connected.vercelProjectId && (
            <>
              <Rows>
                <Row label="Vercel project">
                  <span className="font-mono text-[12px]">
                    {connected.vercelProjectName ?? connected.vercelProjectId}
                  </span>
                </Row>
                <Row label="Environments">
                  {Object.keys(connected.mappings).length === 0 ? (
                    <span className="text-muted">None mapped</span>
                  ) : (
                    <ul className="space-y-1">
                      {Object.entries(connected.mappings).map(([env, t]) => (
                        <li key={env}>
                          {envLabel(env)} <span className="text-muted">to</span>{" "}
                          <span className="capitalize">{t}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Row>
                <Row label="Existing variables">
                  {connected.conflictPolicy === "skip"
                    ? "Left untouched when names clash"
                    : "Overwritten when names clash"}
                </Row>
                <Row label="Auto redeploy">
                  {connected.autoRedeploy ? "On" : "Off"}
                  {!connected.hookConfigured && (
                    <span className="text-muted"> (no deploy hook)</span>
                  )}
                </Row>
                <Row label="Last sync">
                  {connected.syncing
                    ? "Syncing now..."
                    : connected.lastSyncAt
                      ? `${dateFormat.format(new Date(connected.lastSyncAt))} (${connected.lastSyncStatus})`
                      : "Never"}
                  {connected.pending > 0 && !connected.syncing && (
                    <span className="text-muted">, {connected.pending} queued</span>
                  )}
                </Row>
                {connected.lastRun && (
                  <Row label="Last result">
                    {connected.lastRun.created} created, {connected.lastRun.updated} updated,{" "}
                    {connected.lastRun.deleted} deleted, {connected.lastRun.unchanged} unchanged
                    {connected.lastRun.conflicts.length > 0 && (
                      <span className="mt-1 block text-red-700">
                        Already in Vercel, left untouched:{" "}
                        <span className="font-mono text-[12px]">
                          {connected.lastRun.conflicts.join(", ")}
                        </span>
                      </span>
                    )}
                    {connected.lastRun.failed.length > 0 && (
                      <span className="mt-1 block text-red-700">
                        Could not sync:{" "}
                        <span className="font-mono text-[12px]">
                          {connected.lastRun.failed.join(", ")}
                        </span>
                      </span>
                    )}
                  </Row>
                )}
                {connected.lastDeployment && (
                  <Row label="Last deployment">
                    {connected.lastDeployment.state}
                    {connected.lastDeployment.url && (
                      <>
                        {" "}
                        <a
                          href={connected.lastDeployment.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="break-all underline underline-offset-2 hover:text-accent"
                        >
                          {connected.lastDeployment.url}
                        </a>
                      </>
                    )}
                    <span className="text-muted">
                      {" "}
                      ({dateFormat.format(new Date(connected.lastDeployment.triggeredAt))})
                    </span>
                  </Row>
                )}
                {connected.lastError && connected.status !== "attention" && (
                  <Row label="Last error">
                    <span role="alert" className="text-red-700">
                      {connected.lastError}
                    </span>
                  </Row>
                )}
              </Rows>
              <p className="border-t border-border px-5 py-3 text-[12px] text-muted">
                Running deployments pick up variable changes after a redeploy.
              </p>
            </>
          )}

          {!editing && !connected.vercelProjectId && connected.status !== "attention" && (
            <p className="px-5 py-6 text-[13px] text-muted">
              Token connected. Choose the Vercel project to sync this project&apos;s secrets to.
            </p>
          )}

          {editing && (
            <div className="space-y-5 px-5 py-5">
              {!options && busy === "options" && (
                <div className="space-y-3">
                  <div className="h-10 animate-pulse bg-code" />
                  <div className="h-24 animate-pulse bg-code" />
                </div>
              )}
              {options && (
                <>
                  <Field
                    id="vercel-project"
                    label="Vercel project"
                    hint={
                      options.projects.length === 0
                        ? "No projects found. For team projects, reconnect with the team ID."
                        : undefined
                    }
                  >
                    <Select
                      id="vercel-project"
                      value={project}
                      onChange={setProject}
                      placeholder="Choose a project..."
                      options={options.projects.map((p) => ({ value: p.id, label: p.name }))}
                      className="w-full"
                    />
                  </Field>

                  <fieldset>
                    <legend className="mb-1.5 text-[13px] font-medium">Environment mapping</legend>
                    <div className="divide-y divide-border border border-border">
                      {connected.environments.map((env) => (
                        <div
                          key={env}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
                        >
                          <span>{envLabel(env)}</span>
                          <Select
                            aria-label={`Vercel target for ${envLabel(env)}`}
                            value={mappings[env] ?? ""}
                            onChange={(next) => setMappings((m) => ({ ...m, [env]: next }))}
                            options={TARGET_OPTIONS}
                            size="sm"
                            capitalize
                            className="w-44"
                          />
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  <Field
                    id="vercel-policy"
                    label="When a variable already exists in Vercel"
                    hint="Keel only changes variables it created or took over."
                  >
                    <Select<"skip" | "overwrite">
                      id="vercel-policy"
                      value={policy}
                      onChange={setPolicy}
                      options={POLICY_OPTIONS}
                      className="w-full"
                    />
                  </Field>

                  <Field
                    id="vercel-hook"
                    label="Deploy hook URL"
                    optional
                    hint={
                      connected.hookConfigured
                        ? "A hook is set. Enter a new URL to replace it."
                        : "Create one in Vercel under Project Settings, Git, Deploy Hooks."
                    }
                  >
                    <input
                      id="vercel-hook"
                      type="password"
                      autoComplete="off"
                      value={hook}
                      onChange={(e) => setHook(e.target.value)}
                      aria-describedby="vercel-hook-help"
                      placeholder="https://api.vercel.com/v1/integrations/deploy/..."
                      className={inputClass}
                    />
                  </Field>

                  <label className="flex cursor-pointer items-start gap-3 border border-border p-3 transition-colors hover:border-[#B8B8B2]">
                    <input
                      type="checkbox"
                      checked={autoRedeploy}
                      onChange={(e) => setAutoRedeploy(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-accent"
                    />
                    <span>
                      <span className="block text-[13px] font-medium">Redeploy automatically</span>
                      <span className="block text-[12px] text-muted">
                        After a successful sync. Rapid changes are batched into one deployment.
                      </span>
                    </span>
                  </label>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      {confirmDisconnect && (
        <ConfirmDeleteDialog
          title="Disconnect Vercel"
          name="the Vercel integration"
          verb="disconnect"
          actionLabel="Disconnect"
          warning="Variables already in Vercel stay as they are; Keel stops managing them."
          onConfirm={disconnect}
          onClose={() => setConfirmDisconnect(false)}
        />
      )}
    </div>
  );
}
