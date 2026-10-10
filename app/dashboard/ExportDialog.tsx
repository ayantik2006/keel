"use client";

import { useState } from "react";
import { exportFilename } from "../../lib/dotenv";
import { api, errorMessage } from "./api";
import { useModal } from "./Dialogs";

type Props = {
  projectId: string;
  env: string;
  count: number;
  onClose: () => void;
  flash: (message: string) => void;
};

export default function ExportDialog({ projectId, env, count, onClose, flash }: Props) {
  const { ref, props } = useModal(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filename = exportFilename(env);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const text = await api.exportDotenv(projectId, env);
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash(`Downloaded ${filename}`);
      ref.current?.close();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <dialog
      {...props}
      aria-labelledby="export-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="px-5 py-5">
        <h2 id="export-title" className="text-[16px] font-semibold tracking-tight">
          Export secrets
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          This downloads the {count} secret{count === 1 ? "" : "s"} of{" "}
          <span className="font-medium text-ink">{env}</span> as a file named{" "}
          <code className="text-ink">{filename}</code>, with their values in plain text.
        </p>
        <ul className="mt-3 list-disc pl-5 text-[13px] leading-relaxed text-muted">
          <li>Anyone who gets the file can read every value.</li>
          <li>Do not commit it to Git or share it over chat or email.</li>
          <li>The export is recorded in the audit log.</li>
        </ul>
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
          onClick={download}
          disabled={busy}
          className="bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Preparing..." : "Download file"}
        </button>
      </div>
    </dialog>
  );
}
