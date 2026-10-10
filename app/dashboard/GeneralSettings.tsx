"use client";

import { useState } from "react";
import { api, errorMessage } from "./api";
import { ConfirmDeleteDialog } from "./Dialogs";
import { CopyIcon } from "./icons";
import {
  Card,
  Chip,
  Field,
  Row,
  Rows,
  dangerButton,
  ghostButton,
  inputClass,
  primaryButton,
} from "./SettingsUI";
import { dateFormat, envLabel, hasPermission, type Project } from "./types";

type Props = {
  project: Project;
  flash: (message: string) => void;
  /** Called with the saved project so the rest of the app stays in sync. */
  onSaved: (project: Project) => void;
  onDeleted: (projectId: string) => void;
};

const NAME_MAX = 60;
const DESCRIPTION_MAX = 280;

export default function GeneralSettings({ project, flash, onSaved, onDeleted }: Props) {
  const canEdit = hasPermission(project, "project:update");
  const canDelete = hasPermission(project, "project:delete");

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const trimmed = name.trim();
  const dirty =
    trimmed !== project.name || description.trim() !== (project.description ?? "");

  const nameError =
    trimmed.length === 0
      ? "Project name is required."
      : trimmed.length > NAME_MAX
        ? `Use ${NAME_MAX} characters or fewer.`
        : null;
  const descriptionError =
    description.length > DESCRIPTION_MAX
      ? `Use ${DESCRIPTION_MAX} characters or fewer.`
      : null;

  function reset() {
    setName(project.name);
    setDescription(project.description ?? "");
    setServerError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (nameError || descriptionError || !dirty) return;
    setSaving(true);
    setServerError(null);
    try {
      const saved = await api.updateProject(project.id, {
        name: trimmed,
        description: description.trim(),
      });
      onSaved(saved);
      setName(saved.name);
      setDescription(saved.description ?? "");
      flash("Project settings saved");
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<string | null> {
    try {
      await api.deleteProject(project.id);
      flash(`Deleted ${project.name}`);
      onDeleted(project.id);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(project.id);
      flash("Project ID copied");
    } catch {
      flash("Could not access the clipboard");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} noValidate>
        <Card
          title="Project details"
          description="How this project appears to everyone who has access."
          footer={
            canEdit ? (
              <>
                <p role="status" className="text-[12px] text-muted">
                  {saving ? "Saving..." : dirty ? "You have unsaved changes." : "All changes saved."}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={!dirty || saving}
                    className={ghostButton}
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    disabled={!dirty || saving || Boolean(nameError || descriptionError)}
                    className={primaryButton}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-muted">
                Only owners and admins can change project settings.
              </p>
            )
          }
        >
          <div className="space-y-5 px-5 py-5">
            <Field
              id="project-name"
              label="Project name"
              error={nameError ?? serverError}
              hint="Shown in the project picker and the audit log."
              counter={`${trimmed.length} / ${NAME_MAX}`}
            >
              <input
                id="project-name"
                value={name}
                disabled={!canEdit || saving}
                onChange={(e) => {
                  setName(e.target.value);
                  setServerError(null);
                }}
                aria-invalid={nameError || serverError ? true : undefined}
                aria-describedby="project-name-help"
                className={inputClass}
              />
            </Field>

            <Field
              id="project-description"
              label="Description"
              optional
              error={descriptionError}
              hint="A short note about what this project is for."
              counter={`${description.length} / ${DESCRIPTION_MAX}`}
            >
              <textarea
                id="project-description"
                rows={3}
                value={description}
                disabled={!canEdit || saving}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={descriptionError ? true : undefined}
                aria-describedby="project-description-help"
                className={`${inputClass} resize-y`}
              />
            </Field>
          </div>
        </Card>
      </form>

      <Card title="Project information" description="Reference details for this project. These cannot be edited.">
        <Rows>
          <Row label="Project ID">
            <div className="flex items-center gap-2">
              <code className="min-w-0 break-all font-mono text-[12px]">{project.id}</code>
              <button
                type="button"
                onClick={copyId}
                aria-label="Copy project ID"
                title="Copy project ID"
                className="flex h-7 w-7 shrink-0 items-center justify-center text-muted transition-colors hover:bg-code hover:text-ink"
              >
                <CopyIcon />
              </button>
            </div>
          </Row>
          <Row label="Your role">
            <span className="capitalize">{project.role}</span>
          </Row>
          <Row label="Environments">
            {project.environments.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {project.environments.map((env) => (
                  <Chip key={env}>{envLabel(env)}</Chip>
                ))}
              </div>
            ) : (
              <span className="text-muted">None you have access to</span>
            )}
          </Row>
          <Row label="Created">{dateFormat.format(new Date(project.createdAt))}</Row>
          <Row label="Last updated">{dateFormat.format(new Date(project.updatedAt))}</Row>
        </Rows>
      </Card>

      {canDelete && (
        <Card title="Danger zone" tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium">Delete this project</p>
              <p className="mt-0.5 max-w-md text-[13px] text-muted">
                Removes all of its secrets, version history and members. This cannot
                be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={dangerButton}
            >
              Delete project
            </button>
          </div>
        </Card>
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          title="Delete project"
          name={project.name}
          warning="All of its environments and secrets will be removed."
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
