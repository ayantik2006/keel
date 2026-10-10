"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ENVIRONMENTS, type Project, type Secret } from "./types";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const props = {
    ref,
    onClose,
    onClick: (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === ref.current) ref.current?.close();
    },
  };
  return { ref, props };
}

const dialogClass =
  "m-auto w-[calc(100%-2rem)] max-w-md border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40";

type SecretFormProps = {
  secret: Secret | null;
  existingKeys: string[];
  /** Loads the current value when editing. Values are not part of list data. */
  loadValue?: () => Promise<string>;
  /** Resolves to an error message, or null on success. */
  onSubmit: (data: { key: string; value: string }) => Promise<string | null>;
  onClose: () => void;
};

export function SecretFormDialog({
  secret,
  existingKeys,
  loadValue,
  onSubmit,
  onClose,
}: SecretFormProps) {
  const { ref, props } = useModal(onClose);
  const formId = useId();
  const [key, setKey] = useState(secret?.key ?? "");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loader] = useState(() => loadValue);
  const [loadingValue, setLoadingValue] = useState(Boolean(loadValue));
  const editing = secret !== null;

  useEffect(() => {
    if (!loader) return;
    let alive = true;
    loader()
      .then((v) => {
        if (!alive) return;
        setValue(v);
        setLoadingValue(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load value.");
        setLoadingValue(false);
      });
    return () => {
      alive = false;
    };
  }, [loader]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return setError("Key is required.");
    if (!KEY_PATTERN.test(trimmed))
      return setError(
        "Use letters, numbers, and underscores. Cannot start with a number.",
      );
    if (existingKeys.some((k) => k.toLowerCase() === trimmed.toLowerCase()))
      return setError(
        "A secret with this key already exists in this environment.",
      );
    if (!value) return setError("Value is required.");
    setSubmitting(true);
    const failure = await onSubmit({ key: trimmed, value });
    if (failure) {
      setError(failure);
      setSubmitting(false);
      return;
    }
    ref.current?.close();
  }

  return (
    <dialog
      {...props}
      aria-labelledby={`${formId}-title`}
      className={dialogClass}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="border-b border-border px-5 py-4">
          <h2
            id={`${formId}-title`}
            className="text-[16px] font-semibold tracking-tight"
          >
            {editing ? "Edit secret" : "Add secret"}
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {editing
              ? "Update the key or value. Changes apply to this environment only."
              : "Create a new secret in the selected environment."}
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label
              htmlFor={`${formId}-key`}
              className="text-[13px] font-medium"
            >
              Key
            </label>
            <input
              id={`${formId}-key`}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
              placeholder="STRIPE_SECRET_KEY"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${formId}-error` : undefined}
              className="mt-1.5 w-full border border-[#B8B8B2] bg-surface px-3 py-2 font-mono text-[13px] outline-none placeholder:text-muted/60 focus:border-ink"
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-value`}
              className="text-[13px] font-medium"
            >
              Value
            </label>
            <textarea
              id={`${formId}-value`}
              rows={3}
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder={
                loadingValue ? "Loading value..." : "Paste the secret value"
              }
              disabled={loadingValue}
              className="mt-1.5 w-full resize-y border border-[#B8B8B2] bg-surface px-3 py-2 font-mono text-[13px] outline-none placeholder:text-muted/60 focus:border-ink"
            />
          </div>
          {error && (
            <p
              id={`${formId}-error`}
              role="alert"
              className="text-[13px] text-red-600"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || loadingValue}
            className="bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : editing ? "Save changes" : "Add secret"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

type DeleteProps = {
  title: string;
  name: string;
  mono?: boolean;
  warning: string;
  /** Verb and button label. Defaults to delete. */
  verb?: string;
  actionLabel?: string;
  /** Red button for destructive actions. Set false for restore and similar. */
  destructive?: boolean;
  /** Resolves to an error message, or null on success. */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
};

export function ConfirmDeleteDialog({
  title,
  name,
  mono,
  warning,
  verb = "delete",
  actionLabel = "Delete",
  destructive = true,
  onConfirm,
  onClose,
}: DeleteProps) {
  const { ref, props } = useModal(onClose);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <dialog {...props} aria-labelledby={`${id}-title`} className={dialogClass}>
      <div className="px-5 py-5">
        <h2
          id={`${id}-title`}
          className="text-[16px] font-semibold tracking-tight"
        >
          {title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Are you sure you want to {verb}{" "}
          <span className={mono ? "font-mono text-[13px] text-ink" : "font-medium text-ink"}>
            {name}
          </span>
          ? {warning}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-red-600">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          autoFocus
          onClick={() => ref.current?.close()}
          className="border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const failure = await onConfirm();
            if (failure) {
              setError(failure);
              setBusy(false);
              return;
            }
            ref.current?.close();
          }}
          className={`px-3.5 py-2 text-[13px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            destructive
              ? "bg-red-600 hover:bg-red-700"
              : "bg-ink hover:bg-accent"
          }`}
        >
          {busy ? "Working..." : actionLabel}
        </button>
      </div>
    </dialog>
  );
}

type ProjectFormProps = {
  project: Project | null;
  existingNames: string[];
  onSubmit: (data: {
    name: string;
    description: string;
    environments: string[];
  }) => Promise<string | null>;
  onClose: () => void;
};

export function ProjectFormDialog({
  project,
  existingNames,
  onSubmit,
  onClose,
}: ProjectFormProps) {
  const { ref, props } = useModal(onClose);
  const formId = useId();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [envs, setEnvs] = useState<string[]>(
    ENVIRONMENTS.map((e) => e.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const editing = project !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Project name is required.");
    if (trimmed.length > 60)
      return setError("Project name must be 60 characters or fewer.");
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase()))
      return setError("A project with this name already exists.");
    if (!editing && envs.length === 0)
      return setError("Select at least one environment.");
    setSubmitting(true);
    const failure = await onSubmit({
      name: trimmed,
      description,
      environments: ENVIRONMENTS.map((x) => x.id).filter((id) =>
        envs.includes(id),
      ),
    });
    if (failure) {
      setError(failure);
      setSubmitting(false);
      return;
    }
    ref.current?.close();
  }

  return (
    <dialog
      {...props}
      aria-labelledby={`${formId}-title`}
      className={dialogClass}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="border-b border-border px-5 py-4">
          <h2
            id={`${formId}-title`}
            className="text-[16px] font-semibold tracking-tight"
          >
            {editing ? "Rename project" : "Create project"}
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {editing
              ? "Update the project name or description."
              : "Projects group secrets across environments."}
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label
              htmlFor={`${formId}-name`}
              className="text-[13px] font-medium"
            >
              Project name
            </label>
            <input
              id={`${formId}-name`}
              autoFocus
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Web App"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${formId}-error` : undefined}
              className="mt-1.5 w-full border border-[#B8B8B2] bg-surface px-3 py-2 text-[14px] outline-none placeholder:text-muted/60 focus:border-ink"
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-desc`}
              className="text-[13px] font-medium"
            >
              Description{" "}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id={`${formId}-desc`}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project for?"
              className="mt-1.5 w-full resize-y border border-[#B8B8B2] bg-surface px-3 py-2 text-[14px] outline-none placeholder:text-muted/60 focus:border-ink"
            />
          </div>
          {!editing && (
            <fieldset>
              <legend className="text-[13px] font-medium">
                Initial environments
              </legend>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {ENVIRONMENTS.map((e) => (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-center gap-2 text-[14px]"
                  >
                    <input
                      type="checkbox"
                      checked={envs.includes(e.id)}
                      onChange={(ev) => {
                        setError(null);
                        setEnvs((prev) =>
                          ev.target.checked
                            ? [...prev, e.id]
                            : prev.filter((x) => x !== e.id),
                        );
                      }}
                      className="h-4 w-4 accent-[#f2762e]"
                    />
                    {e.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && (
            <p
              id={`${formId}-error`}
              role="alert"
              className="text-[13px] text-red-600"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Saving..."
              : editing
                ? "Save changes"
                : "Create project"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
