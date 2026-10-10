"use client";

import { useMemo, useRef, useState } from "react";
import {
  KEY_PATTERN,
  MAX_KEY_LENGTH,
  MAX_VALUE_LENGTH,
  parseDotenv,
  type ParsedEntry,
} from "../../lib/dotenv";
import { api, errorMessage } from "./api";
import { useModal } from "./Dialogs";
import Select from "./Select";
import { UploadIcon } from "./icons";
import type { ImportResponse } from "./types";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_ENTRIES = 500;

type Props = {
  projectId: string;
  env: string;
  existingKeys: string[];
  /** Server-granted: may overwrite existing secrets. */
  canOverwrite: boolean;
  onClose: () => void;
  /** Called once an import actually changed data, so the list can reload. */
  onImported: () => void;
};

type DupChoice = "first" | "last" | "skip";

type Group = {
  key: string;
  occurrences: ParsedEntry[];
};

const btn =
  "border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-60";
const primary =
  "bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60";

function validFileName(name: string) {
  return /^\.env(\.[A-Za-z0-9_-]+)*$/.test(name) || /\.env$/i.test(name);
}

/** `.env.production` suggests production. */
function nameHint(name: string): string | null {
  const m = /^\.env\.([A-Za-z0-9_-]+)$/.exec(name);
  return m ? m[1].toLowerCase() : null;
}

export default function ImportDialog({
  projectId,
  env,
  existingKeys,
  canOverwrite,
  onClose,
  onImported,
}: Props) {
  const { ref, props } = useModal(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseDotenv> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [dupChoice, setDupChoice] = useState<Record<string, DupChoice>>({});
  const [overwrite, setOverwrite] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<"select" | "preview" | "confirm" | "result">("select");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [skippedLocally, setSkippedLocally] = useState(0);

  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);

  async function load(file: File) {
    setError(null);
    if (!validFileName(file.name)) {
      setError("Choose a .env file (.env, .env.development, .env.staging, .env.production).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 256 KB.");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("The file could not be read.");
      return;
    }
    if (text.includes("\u0000")) {
      setError("That does not look like a text file.");
      return;
    }
    const result = parseDotenv(text);
    if (result.entries.length === 0 && result.problems.length === 0) {
      setError("The file has no variables.");
      return;
    }
    if (result.entries.length > MAX_ENTRIES) {
      setError(`The file has more than ${MAX_ENTRIES} variables. Split it and import in parts.`);
      return;
    }
    setFileName(file.name);
    setParsed(result);
    setDupChoice({});
    setOverwrite({});
    setStep("preview");
  }

  // Classify entries.
  const analysis = useMemo(() => {
    if (!parsed) return null;
    const invalid: { line: number; key?: string; message: string }[] = [...parsed.problems];
    const byKey = new Map<string, ParsedEntry[]>();

    for (const e of parsed.entries) {
      if (!KEY_PATTERN.test(e.key) || e.key.length > MAX_KEY_LENGTH) {
        invalid.push({ line: e.line, key: e.key, message: "Invalid key." });
      } else if (e.value === "") {
        invalid.push({ line: e.line, key: e.key, message: "Empty values are not supported." });
      } else if (e.value.length > MAX_VALUE_LENGTH) {
        invalid.push({ line: e.line, key: e.key, message: `Value is longer than ${MAX_VALUE_LENGTH} characters.` });
      } else {
        const list = byKey.get(e.key) ?? [];
        list.push(e);
        byKey.set(e.key, list);
      }
    }
    const groups: Group[] = [...byKey.entries()].map(([key, occurrences]) => ({ key, occurrences }));
    invalid.sort((a, b) => a.line - b.line);
    return { groups, invalid };
  }, [parsed]);

  /** What will actually be sent, and what is still undecided. */
  const plan = useMemo(() => {
    if (!analysis) return null;
    const send: { key: string; value: string; overwrite: boolean }[] = [];
    let create = 0;
    let replace = 0;
    let skip = 0;
    let unresolved = 0;

    for (const g of analysis.groups) {
      const dup = g.occurrences.length > 1;
      let chosen: ParsedEntry | null = g.occurrences[0];
      if (dup) {
        const c = dupChoice[g.key];
        if (!c) {
          unresolved++;
          continue;
        }
        if (c === "skip") {
          skip++;
          continue;
        }
        chosen = c === "first" ? g.occurrences[0] : g.occurrences[g.occurrences.length - 1];
      }
      if (existing.has(g.key)) {
        if (canOverwrite && overwrite[g.key]) {
          send.push({ key: g.key, value: chosen.value, overwrite: true });
          replace++;
        } else skip++;
      } else {
        send.push({ key: g.key, value: chosen.value, overwrite: false });
        create++;
      }
    }
    return { send, create, replace, skip, unresolved };
  }, [analysis, dupChoice, overwrite, existing, canOverwrite]);

  async function submit() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.importSecrets(projectId, env, plan.send);
      setSkippedLocally(plan.skip);
      setResult(res);
      setStep("result");
      if (res.summary.created + res.summary.updated > 0) onImported();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const hint = nameHint(fileName);
  const mismatch = hint && ["development", "staging", "production"].includes(hint) && hint !== env;

  return (
    <dialog
      {...props}
      aria-labelledby="import-title"
      className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto border border-border bg-background p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 id="import-title" className="text-[20px] font-semibold tracking-tight">
              Import secrets
            </h1>
            <p className="mt-1 text-[13px] text-muted">
              Into the <span className="font-medium text-ink">{env}</span> environment.
              The file is read in your browser and nothing is uploaded until you confirm.
            </p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} className={btn}>
            Close
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[13px] text-red-600">
            {error}
          </p>
        )}

        {step === "select" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void load(file);
            }}
            className={`mt-5 flex flex-col items-center gap-3 border border-dashed px-6 py-12 text-center ${
              dragging ? "border-ink bg-code" : "border-[#B8B8B2] bg-surface"
            }`}
          >
            <UploadIcon className="h-6 w-6 text-muted" />
            <p className="text-[14px]">Drop a .env file here, or</p>
            <button type="button" onClick={() => inputRef.current?.click()} className={primary}>
              Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              aria-label="Choose a .env file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void load(file);
                e.target.value = "";
              }}
            />
            <p className="text-[12px] text-muted">
              .env, .env.development, .env.staging, .env.production. Up to 256 KB and
              500 variables.
            </p>
          </div>
        )}

        {step !== "select" && analysis && plan && (
          <>
            {mismatch && (
              <p className="mt-4 border border-accent bg-accent-soft px-3 py-2 text-[13px]">
                This file is named <code>{fileName}</code> but you are importing into{" "}
                <strong>{env}</strong>. Make sure that is what you want.
              </p>
            )}
          </>
        )}

        {step === "preview" && analysis && plan && (
          <div className="mt-5">
            <p className="text-[13px] text-muted">
              <span className="font-mono text-ink">{fileName}</span>:{" "}
              {analysis.groups.length} variable{analysis.groups.length === 1 ? "" : "s"}
              {analysis.invalid.length > 0 && `, ${analysis.invalid.length} invalid`}.
              Values are hidden in this preview.
            </p>

            {canOverwrite && analysis.groups.some((g) => existing.has(g.key)) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-muted">Existing keys:</span>
                <button
                  className={btn}
                  onClick={() =>
                    setOverwrite(Object.fromEntries(analysis.groups.filter((g) => existing.has(g.key)).map((g) => [g.key, true])))
                  }
                >
                  Overwrite all
                </button>
                <button className={btn} onClick={() => setOverwrite({})}>
                  Skip all
                </button>
              </div>
            )}

            <div className="mt-3 overflow-x-auto border border-border bg-surface">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-code/60 text-[12px] uppercase tracking-wider text-muted">
                    <th scope="col" className="px-4 py-2.5 font-medium">Key</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Operation</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.groups.map((g) => {
                    const dup = g.occurrences.length > 1;
                    const isExisting = existing.has(g.key);
                    const choice = dupChoice[g.key];
                    const skippedDup = dup && choice === "skip";
                    const status = dup ? "Duplicate" : isExisting ? "Existing" : "New";
                    const needsOverwriteChoice = isExisting && !skippedDup && (!dup || choice);
                    return (
                      <tr key={g.key} className="border-b border-border last:border-b-0 align-top">
                        <td className="px-4 py-3 font-mono text-[13px]">{g.key}</td>
                        <td className="px-4 py-3 text-[13px]">
                          <span
                            className={`px-1.5 py-0.5 text-[12px] ${
                              status === "New"
                                ? "bg-code"
                                : status === "Existing"
                                  ? "bg-accent-soft"
                                  : "bg-red-50 text-red-700"
                            }`}
                          >
                            {status}
                          </span>
                          {dup && (
                            <span className="ml-2 text-[12px] text-muted">
                              lines {g.occurrences.map((o) => o.line).join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px]">
                          <div className="flex flex-wrap items-center gap-2">
                            {dup && (
                              <Select<DupChoice>
                                aria-label={`Resolve duplicate ${g.key}`}
                                value={choice ?? ""}
                                onChange={(next) =>
                                  setDupChoice((prev) => ({ ...prev, [g.key]: next }))
                                }
                                placeholder="Choose which to use..."
                                options={[
                                  { value: "first", label: `Use first (line ${g.occurrences[0].line})` },
                                  {
                                    value: "last",
                                    label: `Use last (line ${g.occurrences[g.occurrences.length - 1].line})`,
                                  },
                                  { value: "skip", label: "Skip this key" },
                                ]}
                                size="sm"
                                className="w-52"
                              />
                            )}
                            {needsOverwriteChoice && canOverwrite && (
                              <Select<"skip" | "overwrite">
                                aria-label={`Existing key ${g.key}`}
                                value={overwrite[g.key] ? "overwrite" : "skip"}
                                onChange={(next) =>
                                  setOverwrite((prev) => ({ ...prev, [g.key]: next === "overwrite" }))
                                }
                                options={[
                                  { value: "skip", label: "Skip" },
                                  { value: "overwrite", label: "Overwrite (new version)" },
                                ]}
                                size="sm"
                                className="w-52"
                              />
                            )}
                            {needsOverwriteChoice && !canOverwrite && (
                              <span className="text-muted">Skip (no permission to overwrite)</span>
                            )}
                            {!dup && !isExisting && <span>Create</span>}
                            {dup && !choice && (
                              <span className="text-red-700">Needs a choice</span>
                            )}
                            {skippedDup && <span className="text-muted">Skip</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {analysis.invalid.map((p, i) => (
                    <tr key={`bad-${i}`} className="border-b border-border last:border-b-0 bg-red-50/40">
                      <td className="px-4 py-3 font-mono text-[13px]">{p.key ?? `line ${p.line}`}</td>
                      <td className="px-4 py-3 text-[13px]">
                        <span className="bg-red-50 px-1.5 py-0.5 text-[12px] text-red-700">Invalid</span>
                        <span className="ml-2 text-[12px] text-muted">line {p.line}</span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-red-700">{p.message} Not imported.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted" aria-live="polite">
                {plan.create} to create, {plan.replace} to overwrite, {plan.skip} skipped
                {plan.unresolved > 0 && `, ${plan.unresolved} need a choice`}
                {analysis.invalid.length > 0 && `, ${analysis.invalid.length} invalid`}
              </p>
              <div className="flex gap-2">
                <button
                  className={btn}
                  onClick={() => {
                    setStep("select");
                    setParsed(null);
                  }}
                >
                  Choose another file
                </button>
                <button
                  className={primary}
                  disabled={plan.unresolved > 0 || plan.send.length === 0}
                  onClick={() => {
                    setUnderstood(false);
                    setStep("confirm");
                  }}
                >
                  Review import
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && plan && analysis && (
          <div className="mt-5 border border-border bg-surface p-5">
            <h2 className="text-[15px] font-semibold">Confirm import</h2>
            <ul className="mt-3 space-y-1 text-[14px]">
              <li>{plan.create} new secret{plan.create === 1 ? "" : "s"} will be created</li>
              <li>
                {plan.replace} existing secret{plan.replace === 1 ? "" : "s"} will be
                overwritten
              </li>
              <li>{plan.skip} will be skipped</li>
              {analysis.invalid.length > 0 && (
                <li>{analysis.invalid.length} invalid entr{analysis.invalid.length === 1 ? "y" : "ies"} will not be imported</li>
              )}
            </ul>
            {plan.replace > 0 && (
              <label className="mt-4 flex cursor-pointer items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#f2762e]"
                />
                <span>
                  I understand that existing values will be replaced. Each overwrite
                  creates a new version; previous values stay in version history.
                </span>
              </label>
            )}
            <div className="mt-5 flex gap-2">
              <button className={btn} disabled={busy} onClick={() => setStep("preview")}>
                Back
              </button>
              <button
                className={primary}
                disabled={busy || (plan.replace > 0 && !understood)}
                onClick={submit}
              >
                {busy ? "Importing..." : `Import ${plan.send.length} secret${plan.send.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="mt-5" role="status">
            <h2 className="text-[15px] font-semibold">
              {result.summary.failed > 0 ? "Import finished with errors" : "Import complete"}
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Created", result.summary.created],
                ["Overwritten", result.summary.updated],
                ["Unchanged", result.summary.unchanged],
                ["Skipped", result.summary.skipped + skippedLocally],
                ["Failed", result.summary.failed],
              ].map(([label, n]) => (
                <div key={label as string} className="border border-border bg-surface px-3 py-2">
                  <dt className="text-[12px] text-muted">{label}</dt>
                  <dd className="font-mono text-[18px]">{n as number}</dd>
                </div>
              ))}
            </dl>
            {result.summary.failed > 0 && (
              <div className="mt-4 border border-red-200 bg-red-50 p-3 text-[13px]">
                <p className="font-medium text-red-700">These entries were not saved:</p>
                <ul className="mt-1">
                  {result.results
                    .filter((r) => r.status === "failed")
                    .map((r) => (
                      <li key={r.key}>
                        <span className="font-mono">{r.key}</span>: {r.error}
                      </li>
                    ))}
                </ul>
                <p className="mt-2 text-muted">
                  Everything else in the list above was saved. You can import the file again;
                  unchanged secrets are left alone.
                </p>
              </div>
            )}
            <div className="mt-5">
              <button className={primary} onClick={() => ref.current?.close()}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
