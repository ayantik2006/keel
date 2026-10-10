"use client";

import { Fragment, useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import { ConfirmDeleteDialog, useModal } from "./Dialogs";
import { dateFormat, type Secret, type SecretVersion } from "./types";

type Props = {
  projectId: string;
  env: string;
  secret: Secret;
  /** Server-granted permission to update the secret (and so to roll back). */
  canRestore: boolean;
  onClose: () => void;
  /** Called with the secret's new metadata after a successful rollback. */
  onRestored: (secret: Secret) => void;
  flash: (message: string) => void;
};

const TYPE_LABEL: Record<SecretVersion["changeType"], string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  ROLLED_BACK: "Rolled back",
  BASELINE: "Baseline",
};

const ghostButton =
  "border border-[#B8B8B2] px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-ink disabled:opacity-60";

function changedBy(v: SecretVersion) {
  if (!v.changedBy) return "Not recorded";
  if (v.changedBy.isYou) return "You";
  if (v.changedBy.email) return v.changedBy.email;
  return v.changedBy.isMember
    ? `User ${v.changedBy.userId.slice(-6)}`
    : "Former member";
}

export default function VersionHistoryDialog({
  projectId,
  env,
  secret,
  canRestore,
  onClose,
  onRestored,
  flash,
}: Props) {
  const { ref, props } = useModal(onClose);
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<{
    tick: number;
    currentVersion?: number;
    versions?: SecretVersion[];
    error?: string;
  } | null>(null);
  // Historical values fetched on demand. Held only while this dialog is open.
  const [values, setValues] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<SecretVersion | null>(null);

  const ready = data !== null && data.tick === tick;

  useEffect(() => {
    let alive = true;
    api
      .listVersions(projectId, env, secret.id)
      .then((r) => alive && setData({ tick, ...r }))
      .catch((err) => alive && setData({ tick, error: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, [projectId, env, secret.id, tick]);

  async function toggle(v: SecretVersion) {
    if (values[v.versionNumber] !== undefined) {
      setValues((prev) => {
        const next = { ...prev };
        delete next[v.versionNumber];
        return next;
      });
      return;
    }
    setBusy(v.versionNumber);
    try {
      const value = await api.revealVersion(
        projectId,
        env,
        secret.id,
        v.versionNumber,
      );
      setValues((prev) => ({ ...prev, [v.versionNumber]: value }));
    } catch (err) {
      flash(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmRestore(v: SecretVersion): Promise<string | null> {
    try {
      const saved = await api.restoreVersion(
        projectId,
        env,
        secret.id,
        v.versionNumber,
        data?.currentVersion,
      );
      onRestored(saved);
      flash(`Restored version ${v.versionNumber} as version ${saved.version}`);
      setValues({});
      setTick((n) => n + 1);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  return (
    <>
      <dialog
        {...props}
        aria-labelledby="version-history-title"
        className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto border border-border bg-background p-0 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <div className="px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1
                id="version-history-title"
                className="text-[20px] font-semibold tracking-tight"
              >
                Version history
              </h1>
              <p className="mt-1 truncate font-mono text-[13px] text-muted">
                {secret.key}
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className={ghostButton}
            >
              Close
            </button>
          </div>

          <div className="mt-4 overflow-x-auto border border-border bg-surface">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-code/60 text-[12px] uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Version</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Changed by</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Change</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!ready && (
                  <tr aria-hidden="true">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="h-5 animate-pulse bg-code" />
                    </td>
                  </tr>
                )}
                {ready &&
                  data.versions?.map((v) => {
                    const shown = values[v.versionNumber];
                    return (
                      <Fragment key={v.versionNumber}>
                        <tr className="border-b border-border last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px]">
                            v{v.versionNumber}
                            {v.isCurrent && (
                              <span className="ml-2 bg-accent-soft px-1.5 py-0.5 font-sans text-[11px]">
                                Current
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[13px]">{changedBy(v)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted">
                            {dateFormat.format(new Date(v.createdAt))}
                          </td>
                          <td className="px-4 py-3 text-[13px]">
                            {TYPE_LABEL[v.changeType]}
                            {v.restoredFromVersion !== null &&
                              ` from v${v.restoredFromVersion}`}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => toggle(v)}
                                disabled={busy === v.versionNumber}
                                className={ghostButton}
                              >
                                {shown !== undefined ? "Hide" : "Reveal"}
                              </button>
                              {canRestore && !v.isCurrent && (
                                <button
                                  onClick={() => setRestoring(v)}
                                  className={ghostButton}
                                >
                                  Restore
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {shown !== undefined && (
                          <tr className="border-b border-border bg-code/40 last:border-b-0">
                            <td colSpan={5} className="px-4 py-2.5">
                              <code className="block break-all font-mono text-[12px]">
                                {shown}
                              </code>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
            {ready && data.error && (
              <div role="alert" className="px-6 py-10 text-center">
                <p className="text-[14px] font-medium">
                  Could not load version history
                </p>
                <p className="mt-1 text-[13px] text-muted">{data.error}</p>
                <button
                  onClick={() => setTick((n) => n + 1)}
                  className={`${ghostButton} mt-3`}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
          <p className="mt-3 text-[12px] text-muted">
            Restoring creates a new version with the older value. Earlier
            versions are kept.
          </p>
        </div>
      </dialog>

      {restoring && (
        <ConfirmDeleteDialog
          title="Restore version"
          name={`v${restoring.versionNumber} of ${secret.key}`}
          verb="restore"
          actionLabel="Restore"
          destructive={false}
          warning="This creates a new version with that value and replaces the current value."
          onConfirm={() => confirmRestore(restoring)}
          onClose={() => setRestoring(null)}
        />
      )}
    </>
  );
}
