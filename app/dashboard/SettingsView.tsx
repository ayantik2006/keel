"use client";

import AccountSettings from "./AccountSettings";
import AuditLog from "./AuditLog";
import GeneralSettings from "./GeneralSettings";
import MembersAccess from "./MembersAccess";
import ProjectSelect from "./ProjectSelect";
import SecuritySettings from "./SecuritySettings";
import { hasPermission, type Project } from "./types";

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    title: "General",
    description: "Name and basic details for this project.",
    projectScoped: true,
  },
  {
    id: "members",
    label: "Members & Access",
    title: "Members & Access",
    description: "Who can use this project, what they can do, and which environments they can reach.",
    projectScoped: true,
  },
  {
    id: "security",
    label: "Security",
    title: "Security",
    description: "How this project's secrets and access are protected, as configured today.",
    projectScoped: true,
  },
  {
    id: "audit",
    label: "Audit Logs",
    title: "Audit Logs",
    description: "A record of security-relevant activity. Secret values are never recorded.",
    projectScoped: true,
  },
  {
    id: "account",
    label: "Account",
    title: "Account",
    description: "Your personal profile and sessions. These apply to you across all projects.",
    projectScoped: false,
  },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

export const isSettingsSection = (v: unknown): v is SettingsSection =>
  SETTINGS_SECTIONS.some((s) => s.id === v);

type Props = {
  projects: Project[];
  /** Undefined when the user has no project. Account settings still work. */
  project: Project | undefined;
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onViewAllProjects: () => void;
  onProjectSaved: (project: Project) => void;
  onProjectGone: (projectId: string) => void;
  flash: (message: string) => void;
};

function Restricted({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="border border-border bg-surface px-6 py-10 text-center">
      <p className="mx-auto max-w-sm text-[13px] text-muted">{children}</p>
    </div>
  );
}

export default function SettingsView({
  projects,
  project,
  section,
  onSection,
  onSelectProject,
  onCreateProject,
  onViewAllProjects,
  onProjectSaved,
  onProjectGone,
  flash,
}: Props) {
  const current = SETTINGS_SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-[14px] text-muted">
            {!current.projectScoped
              ? "Manage your own account."
              : project
                ? `Manage ${project.name}.`
                : "Create a project to manage its settings."}
          </p>
        </div>
        {current.projectScoped && project && (
          <ProjectSelect
            projects={projects}
            value={project.id}
            onChange={onSelectProject}
            onCreate={onCreateProject}
            onViewAll={onViewAllProjects}
          />
        )}
      </div>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="no-scrollbar -mx-4 mt-6 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-border px-4 sm:-mx-8 sm:gap-7 sm:px-8"
      >
        {SETTINGS_SECTIONS.map((s, i) => {
          const active = s.id === section;
          const personal = !s.projectScoped;
          return (
            <button
              key={s.id}
              role="tab"
              id={`settings-tab-${s.id}`}
              aria-selected={active}
              aria-controls="settings-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => onSection(s.id)}
              onKeyDown={(e) => {
                const step =
                  e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                const edge = e.key === "Home" ? 0 : e.key === "End" ? SETTINGS_SECTIONS.length - 1 : -1;
                if (!step && edge < 0) return;
                e.preventDefault();
                const n = SETTINGS_SECTIONS.length;
                const next = SETTINGS_SECTIONS[edge >= 0 ? edge : (i + step + n) % n].id;
                onSection(next);
                document.getElementById(`settings-tab-${next}`)?.focus();
              }}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-3 pt-1 text-[14px] transition-colors ${
                personal ? "ml-auto" : ""
              } ${
                active
                  ? "border-accent font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        key={section}
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${section}`}
        className={`mt-6 animate-view-in motion-reduce:animate-none ${section === "audit" ? "" : "max-w-3xl"}`}
      >
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
          {current.description}
        </p>

        <div className="mt-5">
            {current.projectScoped && !project && (
              <Restricted>
                You do not have a project yet. Create one from the Projects page.
              </Restricted>
            )}
            {/* Remounting per project keeps form state from leaking across projects. */}
            {project && section === "general" && (
              <GeneralSettings
                key={project.id}
                project={project}
                flash={flash}
                onSaved={onProjectSaved}
                onDeleted={onProjectGone}
              />
            )}
            {project && section === "members" && (
              <MembersAccess
                key={project.id}
                project={project}
                flash={flash}
                onLeft={onProjectGone}
              />
            )}
            {project && section === "security" &&
              (hasPermission(project, "audit:read") ? (
                <SecuritySettings key={project.id} projectId={project.id} />
              ) : (
                <Restricted>
                  Only project owners and admins can view security settings. You
                  are {project.role === "admin" ? "an" : "a"} {project.role}.
                </Restricted>
              ))}
            {project && section === "audit" &&
              (hasPermission(project, "audit:read") ? (
                <AuditLog key={project.id} projectId={project.id} />
              ) : (
                <Restricted>
                  Only project owners and admins can view the audit log. You are{" "}
                  {project.role === "admin" ? "an" : "a"} {project.role}.
                </Restricted>
              ))}
            {section === "account" && <AccountSettings flash={flash} />}
        </div>
      </div>
    </div>
  );
}
