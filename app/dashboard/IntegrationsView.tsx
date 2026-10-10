"use client";

import ProjectSelect from "./ProjectSelect";
import VercelIntegration from "./VercelIntegration";
import { hasPermission, type Project } from "./types";

type Props = {
  projects: Project[];
  project: Project;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onViewAllProjects: () => void;
  flash: (message: string) => void;
};

/**
 * Integrations are configured per project, so the page follows the same
 * project selector as the Secrets page. Providers are listed as sections;
 * adding another provider means adding an entry here.
 */
export default function IntegrationsView({
  projects,
  project,
  onSelectProject,
  onCreateProject,
  onViewAllProjects,
  flash,
}: Props) {
  const canManage = hasPermission(project, "integrations:manage");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Integrations</h1>
          <p className="mt-1 text-[14px] text-muted">
            Connect {project.name} to the services that run your code.
          </p>
        </div>
        <ProjectSelect
          projects={projects}
          value={project.id}
          onChange={onSelectProject}
          onCreate={onCreateProject}
          onViewAll={onViewAllProjects}
        />
      </div>

      {canManage ? (
        <section aria-label="Vercel" className="mt-8">
          {/* Remounts per project so no state leaks between projects. */}
          <VercelIntegration key={project.id} projectId={project.id} flash={flash} />
        </section>
      ) : (
        <div
          role="status"
          className="mt-8 border border-border bg-surface px-6 py-10 text-center"
        >
          <p className="text-[15px] font-medium">
            You cannot manage integrations for this project
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
            Only project owners and admins can connect services. You are{" "}
            {project.role === "admin" ? "an" : "a"} {project.role}. Ask an owner
            or admin if you need this set up.
          </p>
        </div>
      )}
    </div>
  );
}
