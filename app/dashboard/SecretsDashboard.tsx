"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ApiRequestError, api, errorMessage } from "./api";
import {
  dateFormat,
  envLabel,
  hasPermission,
  type EnvironmentId,
  type Project,
  type Secret,
} from "./types";
import {
  ConfirmDeleteDialog,
  ProjectFormDialog,
  SecretFormDialog,
} from "./Dialogs";
import MobileMenu from "./MobileMenu";
import Select from "./Select";
import { Logo } from "../components/Logo";
import ProjectsView from "./ProjectsView";
import SettingsView, { isSettingsSection, type SettingsSection } from "./SettingsView";
import ProjectSelect from "./ProjectSelect";
import IntegrationsView from "./IntegrationsView";
import VersionHistoryDialog from "./VersionHistoryDialog";
import ImportDialog from "./ImportDialog";
import ExportDialog from "./ExportDialog";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GearIcon,
  HistoryIcon,
  KeyIcon,
  HomeIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "./icons";

type View = "projects" | "secrets" | "integrations" | "settings";
type UpdatedFilter = "any" | "1" | "7" | "30";

const UPDATED_OPTIONS: { value: UpdatedFilter; label: string }[] = [
  { value: "any", label: "Updated: any time" },
  { value: "1", label: "Updated: last 24 hours" },
  { value: "7", label: "Updated: last 7 days" },
  { value: "30", label: "Updated: last 30 days" },
];

const NAV: { id: View; label: string; Icon: typeof KeyIcon }[] = [
  { id: "projects", label: "Projects", Icon: FolderIcon },
  { id: "secrets", label: "Secrets", Icon: KeyIcon },
  { id: "integrations", label: "Integrations", Icon: PlugIcon },
  { id: "settings", label: "Settings", Icon: GearIcon },
];

const DAY_MS = 86_400_000;

type DialogState =
  | { type: "add" }
  | { type: "edit"; secret: Secret }
  | { type: "delete"; secret: Secret }
  | { type: "history"; secret: Secret }
  | { type: "import" }
  | { type: "export" }
  | { type: "create-project" }
  | { type: "edit-project"; project: Project }
  | { type: "delete-project"; project: Project }
  | null;

const VIEWS: View[] = ["projects", "secrets", "integrations", "settings"];

type InitialState = {
  view?: string;
  section?: string;
  project?: string;
};

export default function SecretsDashboard({ initial = {} }: { initial?: InitialState }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsTick, setProjectsTick] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(
    initial.project && /^[\w-]{1,80}$/.test(initial.project) ? initial.project : null,
  );
  const [envChoice, setEnv] = useState<EnvironmentId>("development");
  // The initial view and settings section come from the URL, so refreshing
  // the page or sharing a link lands in the same place. Values are validated.
  const [view, setView] = useState<View>(
    VIEWS.includes(initial.view as View) ? (initial.view as View) : "secrets",
  );
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(
    isSettingsSection(initial.section) ? initial.section : "general",
  );
  const [query, setQuery] = useState("");
  const [updated, setUpdated] = useState<UpdatedFilter>("any");
  const [cutoff, setCutoff] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    items?: Secret[];
    error?: string;
    denied?: boolean;
  } | null>(null);
  const [secretsTick, setSecretsTick] = useState(0);
  // Decrypted values fetched on demand. Cleared when the view changes.
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const project: Project | undefined =
    projects?.find((p) => p.id === projectId) ?? projects?.[0];
  const env = project?.environments.includes(envChoice)
    ? envChoice
    : (project?.environments[0] ?? envChoice);

  const currentProjectId = project?.id;
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "secrets") params.set("view", view);
    if (view === "settings") params.set("section", settingsSection);
    if (currentProjectId) params.set("project", currentProjectId);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  }, [view, settingsSection, currentProjectId]);

  const secretsKey = project ? `${project.id}:${env}:${secretsTick}` : null;
  const secretsReady = loaded !== null && loaded.key === secretsKey;
  const secretsLoading = project !== undefined && !secretsReady;
  const secrets = useMemo(
    () => (secretsReady ? (loaded.items ?? []) : []),
    [secretsReady, loaded],
  );
  const secretsError = secretsReady ? loaded.error : undefined;
  const secretsDenied = secretsReady && loaded.denied === true;

  // Load projects once, and again on retry.
  useEffect(() => {
    let alive = true;
    api
      .listProjects()
      .then((list) => {
        if (!alive) return;
        setProjects(list);
        setProjectsError(null);
      })
      .catch((err) => alive && setProjectsError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [projectsTick]);

  // Load secret metadata for the selected project and environment.
  const activeProjectId = project?.id;
  useEffect(() => {
    if (!activeProjectId || view !== "secrets") return;
    const key = `${activeProjectId}:${env}:${secretsTick}`;
    let alive = true;
    api
      .listSecrets(activeProjectId, env)
      .then((items) => alive && setLoaded({ key, items }))
      .catch(
        (err) =>
          alive &&
          setLoaded({
            key,
            error: errorMessage(err),
            denied: err instanceof ApiRequestError && err.status === 403,
          }),
      );
    return () => {
      alive = false;
    };
  }, [activeProjectId, env, secretsTick, view]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return secrets.filter(
      (s) =>
        (!q || s.key.toLowerCase().includes(q)) &&
        new Date(s.updatedAt).getTime() >= cutoff,
    );
  }, [secrets, query, cutoff]);

  const filtering = query.trim() !== "" || updated !== "any";

  function changeUpdated(value: UpdatedFilter) {
    setUpdated(value);
    setCutoff(value === "any" ? 0 : Date.now() - Number(value) * DAY_MS);
  }

  function flash(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  function changeEnv(next: EnvironmentId) {
    setEnv(next);
    setValues({});
  }

  function navigate(next: View) {
    setView(next);
    setValues({});
  }

  /** Opens a settings section for the given project (or the current one). */
  function openSettings(section: SettingsSection, id?: string) {
    if (id) switchProject(id);
    setSettingsSection(section);
    navigate("settings");
  }

  /** Changes the selected project and resets per-project view state. */
  function switchProject(id: string) {
    setProjectId(id);
    setQuery("");
    changeUpdated("any");
    setValues({});
  }

  /** Opens a project's secrets (used by the Projects page). */
  function openProject(id: string) {
    switchProject(id);
    setView("secrets");
  }

  /** Applies a change to the loaded list and keeps the project's counts in sync. */
  function applySecrets(fn: (list: Secret[]) => Secret[], updatedAt: string) {
    if (!project || !secretsKey) return;
    const next = fn(secrets);
    setLoaded({ key: secretsKey, items: next });
    setProjects((prev) =>
      prev
        ? prev.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  updatedAt,
                  secretCounts: { ...p.secretCounts, [env]: next.length },
                }
              : p,
          )
        : prev,
    );
  }

  async function toggleReveal(secret: Secret) {
    if (!project) return;
    if (values[secret.id] !== undefined) {
      setValues((v) => without(v, secret.id));
      return;
    }
    setPending((p) => new Set(p).add(secret.id));
    try {
      const value = await api.getSecretValue(project.id, env, secret.id);
      setValues((v) => ({ ...v, [secret.id]: value }));
    } catch (err) {
      flash(errorMessage(err));
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(secret.id);
        return next;
      });
    }
  }

  async function copy(secret: Secret) {
    if (!project) return;
    try {
      const value =
        values[secret.id] ??
        (await api.getSecretValue(project.id, env, secret.id));
      await navigator.clipboard.writeText(value);
      flash(`Copied ${secret.key}`);
    } catch (err) {
      flash(
        err instanceof DOMException
          ? "Could not access the clipboard"
          : errorMessage(err),
      );
    }
  }

  async function handleSave(data: {
    key: string;
    value: string;
  }): Promise<string | null> {
    if (!project) return "No project selected.";
    try {
      if (dialog?.type === "edit") {
        const id = dialog.secret.id;
        const saved = await api.updateSecret(project.id, env, id, {
          ...data,
          expectedVersion: dialog.secret.version,
        });
        applySecrets(
          (list) => list.map((s) => (s.id === id ? saved : s)),
          saved.updatedAt,
        );
        setValues((v) => without(v, id));
        flash(`Updated ${saved.key}`);
      } else {
        const saved = await api.createSecret(project.id, env, data);
        applySecrets((list) => [saved, ...list], saved.updatedAt);
        flash(`Added ${saved.key}`);
      }
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  async function handleDelete(secret: Secret): Promise<string | null> {
    if (!project) return "No project selected.";
    try {
      await api.deleteSecret(project.id, env, secret.id);
      applySecrets(
        (list) => list.filter((s) => s.id !== secret.id),
        new Date().toISOString(),
      );
      flash(`Deleted ${secret.key}`);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  async function handleProjectSave(data: {
    name: string;
    description: string;
    environments: string[];
  }): Promise<string | null> {
    try {
      if (dialog?.type === "edit-project") {
        const id = dialog.project.id;
        const saved = await api.updateProject(id, {
          name: data.name,
          description: data.description,
        });
        setProjects((prev) => prev?.map((p) => (p.id === id ? saved : p)) ?? prev);
        flash(`Updated ${saved.name}`);
      } else {
        const created = await api.createProject(data);
        setProjects((prev) => [created, ...(prev ?? [])]);
        flash(`Created ${created.name}`);
      }
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  async function handleProjectDelete(target: Project): Promise<string | null> {
    try {
      await api.deleteProject(target.id);
      setProjects((prev) => prev?.filter((p) => p.id !== target.id) ?? prev);
      flash(`Deleted ${target.name}`);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  const projectNames = (exceptId?: string) =>
    (projects ?? []).filter((p) => p.id !== exceptId).map((p) => p.name);

  const otherKeys = (exceptId?: string) =>
    secrets.filter((s) => s.id !== exceptId).map((s) => s.key);

  return (
    <div className="relative z-10 flex min-h-screen flex-col bg-background md:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center border-b border-border px-5">
          <Link href="/" aria-label="Keel home" className="-ml-1 flex">
            <Logo className="h-8" />
          </Link>
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-0.5 p-3">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] transition-colors ${
                view === id
                  ? "bg-accent-soft font-medium text-ink"
                  : "text-muted hover:bg-code hover:text-ink"
              }`}
            >
              <Icon className={view === id ? "text-accent" : ""} />
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <Link
            href="/"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-[14px] text-muted transition-colors hover:bg-code hover:text-ink"
          >
            <HomeIcon />
            Back to home
          </Link>
        </div>
        <div className="flex items-center gap-3 border-t border-border p-4">
          <UserButton />
          <span className="text-[13px] text-muted">Account</span>
        </div>
      </aside>

      {/* Top bar with a drawer menu (mobile) */}
      <MobileMenu items={NAV} current={view} onNavigate={navigate} />

      <main key={view} className="min-w-0 flex-1 animate-view-in motion-reduce:animate-none">
        {projects === null ? (
          projectsError ? (
            <ErrorPanel
              message={projectsError}
              onRetry={() => {
                setProjectsError(null);
                setProjectsTick((n) => n + 1);
              }}
            />
          ) : (
            <div
              role="status"
              aria-label="Loading projects"
              className="mx-auto max-w-5xl animate-pulse px-4 py-8 sm:px-8"
            >
              <div className="h-6 w-40 bg-code" />
              <div className="mt-6 h-10 w-full bg-code" />
              <div className="mt-4 h-48 w-full bg-code" />
            </div>
          )
        ) : view === "projects" ? (
          <ProjectsView
            projects={projects}
            onOpen={openProject}
            onCreate={() => setDialog({ type: "create-project" })}
            onRename={(p) => setDialog({ type: "edit-project", project: p })}
            onDelete={(p) => setDialog({ type: "delete-project", project: p })}
            onSettings={(p) => openSettings("general", p.id)}
          />
        ) : (view === "secrets" || view === "integrations") && !project ? (
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-8">
            <h1 className="text-[24px] font-semibold tracking-tight">
              No project selected
            </h1>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
              Create a project to start managing secrets.
            </p>
            <button
              onClick={() => navigate("projects")}
              className="mt-5 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
            >
              Go to projects
            </button>
          </div>
        ) : view === "secrets" && project && project.environments.length === 0 ? (
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-8">
            <h1 className="text-[24px] font-semibold tracking-tight">
              {project.name}
            </h1>
            <div
              role="alert"
              className="mt-6 border border-border bg-surface px-6 py-12 text-center"
            >
              <p className="text-[15px] font-medium">
                You don&apos;t have access to any environment
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
                Ask a project admin to grant you access to an environment.
              </p>
              <button
                onClick={() => navigate("projects")}
                className="mt-4 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
              >
                Back to projects
              </button>
            </div>
          </div>
        ) : view === "secrets" && project ? (
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
            {/* Project selector */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <ProjectSelect
                projects={projects}
                value={project.id}
                onChange={switchProject}
                onCreate={() => setDialog({ type: "create-project" })}
                onViewAll={() => navigate("projects")}
              />
              <div className="flex flex-wrap gap-2">
                {hasPermission(project, "secrets:create") && (
                  <button
                    onClick={() => setDialog({ type: "import" })}
                    disabled={!secretsReady || Boolean(secretsError)}
                    className="inline-flex items-center gap-1.5 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UploadIcon />
                    Import
                  </button>
                )}
                {hasPermission(project, "secrets:read") && (
                  <button
                    onClick={() => setDialog({ type: "export" })}
                    disabled={!secretsReady || Boolean(secretsError) || secrets.length === 0}
                    className="inline-flex items-center gap-1.5 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <DownloadIcon />
                    Export
                  </button>
                )}
                {hasPermission(project, "secrets:create") && (
                  <button
                    onClick={() => setDialog({ type: "add" })}
                    className="inline-flex items-center gap-1.5 bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent"
                  >
                    <PlusIcon />
                    Add Secret
                  </button>
                )}
              </div>
            </div>

            {/* Environment tabs */}
            <div
              role="tablist"
              aria-label="Environments"
              className="mt-6 flex gap-6 overflow-x-auto border-b border-border"
            >
              {project.environments.map((envId) => {
                const e = { id: envId, label: envLabel(envId) };
                const active = e.id === env;
                return (
                  <button
                    key={e.id}
                    role="tab"
                    id={`tab-${e.id}`}
                    aria-selected={active}
                    aria-controls="secrets-panel"
                    tabIndex={active ? 0 : -1}
                    onClick={() => changeEnv(e.id)}
                    onKeyDown={(ev) => {
                      const step =
                        ev.key === "ArrowRight"
                          ? 1
                          : ev.key === "ArrowLeft"
                            ? -1
                            : 0;
                      if (!step) return;
                      const envs = project.environments;
                      const i = envs.indexOf(env);
                      const next = envs[(i + step + envs.length) % envs.length];
                      changeEnv(next);
                      document.getElementById(`tab-${next}`)?.focus();
                    }}
                    className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-1 text-[14px] transition-colors ${
                      active
                        ? "border-accent font-medium text-ink"
                        : "border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    {e.label}
                    <span className="bg-code px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {project.secretCounts[e.id] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              id="secrets-panel"
              role="tabpanel"
              aria-labelledby={`tab-${env}`}
              className="mt-5"
            >
              <p className="mb-3 text-[12px] text-muted">
                Environment{" "}
                <span className="font-medium text-ink">{envLabel(env)}</span>
                {" "}&middot; Your access:{" "}
                <span className="font-medium text-ink">
                  {accessLabel(project)}
                </span>
              </p>

              {/* Search and filter */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search secrets by key"
                    placeholder="Search by key"
                    className="w-full border border-[#B8B8B2] bg-surface py-2 pl-9 pr-3 text-[14px] outline-none placeholder:text-muted/70 focus:border-ink"
                  />
                </div>
                <Select<UpdatedFilter>
                  value={updated}
                  onChange={changeUpdated}
                  aria-label="Filter by last updated"
                  options={UPDATED_OPTIONS}
                  className="sm:w-56"
                />
              </div>

              {/* Table */}
              <div className="mt-4 overflow-x-auto border border-border bg-surface">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border bg-code/60 text-[12px] uppercase tracking-wider text-muted">
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Key
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Value
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Last Updated
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-right font-medium"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {secretsLoading &&
                      [0, 1, 2].map((i) => (
                        <tr
                          key={i}
                          aria-hidden="true"
                          className="border-b border-border last:border-b-0"
                        >
                          <td colSpan={4} className="px-4 py-3">
                            <div className="h-5 animate-pulse bg-code" />
                          </td>
                        </tr>
                      ))}
                    {visible.map((secret) => {
                      const shown = values[secret.id] !== undefined;
                      return (
                        <tr
                          key={secret.id}
                          className="border-b border-border last:border-b-0 hover:bg-code/40"
                        >
                          <td className="px-4 py-3 align-middle font-mono text-[13px] font-medium">
                            {secret.key}
                          </td>
                          <td className="max-w-[18rem] px-4 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <span
                                className={`block truncate font-mono text-[13px] ${
                                  shown
                                    ? "text-ink"
                                    : "select-none tracking-widest text-muted"
                                }`}
                              >
                                {shown ? values[secret.id] : "••••••••••••"}
                              </span>
                              <IconButton
                                label={`${shown ? "Hide" : "Reveal"} value of ${secret.key}`}
                                disabled={pending.has(secret.id)}
                                onClick={() => toggleReveal(secret)}
                              >
                                {shown ? <EyeOffIcon /> : <EyeIcon />}
                              </IconButton>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-middle text-[13px] text-muted">
                            {dateFormat.format(new Date(secret.updatedAt))}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex justify-end gap-1">
                              <IconButton
                                label={`Copy value of ${secret.key}`}
                                onClick={() => copy(secret)}
                              >
                                <CopyIcon />
                              </IconButton>
                              <IconButton
                                label={`Version history of ${secret.key}`}
                                onClick={() =>
                                  setDialog({ type: "history", secret })
                                }
                              >
                                <HistoryIcon />
                              </IconButton>
                              {hasPermission(project, "secrets:update") && (
                                <IconButton
                                  label={`Edit ${secret.key}`}
                                  onClick={() =>
                                    setDialog({ type: "edit", secret })
                                  }
                                >
                                  <PencilIcon />
                                </IconButton>
                              )}
                              {hasPermission(project, "secrets:delete") && (
                                <IconButton
                                  label={`Delete ${secret.key}`}
                                  danger
                                  onClick={() =>
                                    setDialog({ type: "delete", secret })
                                  }
                                >
                                  <TrashIcon />
                                </IconButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {secretsError && (
                  <div role="alert" className="px-6 py-14 text-center">
                    <p className="text-[15px] font-medium">
                      {secretsDenied ? "Access denied" : "Could not load secrets"}
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
                      {secretsError}
                    </p>
                    <button
                      onClick={() => {
                        setLoaded(null);
                        setSecretsTick((n) => n + 1);
                      }}
                      className="mt-4 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {secretsReady && !secretsError && visible.length === 0 && (
                  <div className="px-6 py-14 text-center">
                    <p className="text-[15px] font-medium">
                      {filtering
                        ? "No secrets match your filters"
                        : "No secrets yet"}
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
                      {filtering
                        ? "Try a different search term or clear the filters."
                        : hasPermission(project, "secrets:create")
                          ? `Add your first secret to the ${env} environment.`
                          : `No secrets in the ${env} environment yet.`}
                    </p>
                    {filtering ? (
                      <button
                        onClick={() => {
                          setQuery("");
                          changeUpdated("any");
                        }}
                        className="mt-4 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
                      >
                        Clear filters
                      </button>
                    ) : (
                      hasPermission(project, "secrets:create") && (
                        <button
                          onClick={() => setDialog({ type: "add" })}
                          className="mt-4 inline-flex items-center gap-1.5 bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent"
                        >
                          <PlusIcon />
                          Add Secret
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              <p className="mt-3 text-[12px] text-muted" aria-live="polite">
                {secretsReady && !secretsError
                  ? `Showing ${visible.length} of ${secrets.length} secrets in ${env}.`
                  : "\u00a0"}
              </p>
            </div>
          </div>
        ) : view === "settings" ? (
          <SettingsView
            projects={projects}
            project={project}
            section={settingsSection}
            onSection={setSettingsSection}
            onSelectProject={switchProject}
            onCreateProject={() => setDialog({ type: "create-project" })}
            onViewAllProjects={() => navigate("projects")}
            onProjectSaved={(saved) =>
              setProjects((prev) =>
                prev ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev,
              )
            }
            onProjectGone={(id) => {
              setProjects((prev) => prev?.filter((p) => p.id !== id) ?? prev);
              if (projectId === id) setProjectId(null);
              navigate("projects");
            }}
            flash={flash}
          />
        ) : view === "integrations" && project ? (
          <IntegrationsView
            projects={projects}
            project={project}
            onSelectProject={switchProject}
            onCreateProject={() => setDialog({ type: "create-project" })}
            onViewAllProjects={() => navigate("projects")}
            flash={flash}
          />
        ) : (
          <ComingSoon
            title={NAV.find((n) => n.id === view)!.label}
            onBack={() => navigate("secrets")}
          />
        )}
      </main>

      {dialog?.type === "add" && (
        <SecretFormDialog
          secret={null}
          existingKeys={otherKeys()}
          onSubmit={handleSave}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "edit" && project && (
        <SecretFormDialog
          secret={dialog.secret}
          existingKeys={otherKeys(dialog.secret.id)}
          loadValue={() =>
            api.getSecretValue(project.id, env, dialog.secret.id)
          }
          onSubmit={handleSave}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDeleteDialog
          title="Delete secret"
          name={dialog.secret.key}
          mono
          warning="Anything that depends on it will stop working."
          onConfirm={() => handleDelete(dialog.secret)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "import" && project && (
        <ImportDialog
          projectId={project.id}
          env={env}
          existingKeys={secrets.map((s) => s.key)}
          canOverwrite={hasPermission(project, "secrets:update")}
          onClose={() => setDialog(null)}
          onImported={() => {
            setValues({});
            setLoaded(null);
            setSecretsTick((n) => n + 1);
            setProjectsTick((n) => n + 1);
          }}
        />
      )}
      {dialog?.type === "export" && project && (
        <ExportDialog
          projectId={project.id}
          env={env}
          count={secrets.length}
          flash={flash}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "history" && project && (
        <VersionHistoryDialog
          projectId={project.id}
          env={env}
          secret={dialog.secret}
          canRestore={hasPermission(project, "secrets:update")}
          flash={flash}
          onClose={() => setDialog(null)}
          onRestored={(saved) => {
            applySecrets(
              (list) => list.map((s) => (s.id === saved.id ? saved : s)),
              saved.updatedAt,
            );
            setValues((v) => without(v, saved.id));
          }}
        />
      )}
      {dialog?.type === "create-project" && (
        <ProjectFormDialog
          project={null}
          existingNames={projectNames()}
          onSubmit={handleProjectSave}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "edit-project" && (
        <ProjectFormDialog
          project={dialog.project}
          existingNames={projectNames(dialog.project.id)}
          onSubmit={handleProjectSave}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "delete-project" && (
        <ConfirmDeleteDialog
          title="Delete project"
          name={dialog.project.name}
          warning="All of its environments and secrets will be removed."
          onConfirm={() => handleProjectDelete(dialog.project)}
          onClose={() => setDialog(null)}
        />
      )}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      >
        {toast && (
          <div className="flex animate-fade-up items-center gap-2 bg-ink motion-reduce:animate-none px-4 py-2.5 text-[13px] text-white shadow-lg">
            <CheckIcon className="text-accent" />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 shrink-0 items-center justify-center text-muted transition-colors hover:bg-code disabled:opacity-50 ${
        danger ? "hover:text-red-600" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function accessLabel(project: Project) {
  if (project.role === "owner" || project.role === "admin") return "Full control";
  return hasPermission(project, "secrets:create")
    ? "Read and write"
    : "Read only";
}

function without(values: Record<string, string>, id: string) {
  const next = { ...values };
  delete next[id];
  return next;
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-5xl px-4 py-16 sm:px-8">
      <h1 className="text-[24px] font-semibold tracking-tight">
        Could not load your projects
      </h1>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="mt-5 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
      >
        Try again
      </button>
    </div>
  );
}

function ComingSoon({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-8">
      <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
        This section is not part of the dashboard preview yet.
      </p>
      <button
        onClick={onBack}
        className="mt-5 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
      >
        Back to secrets
      </button>
    </div>
  );
}
