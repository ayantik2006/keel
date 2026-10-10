"use client";

import { useState, useSyncExternalStore } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

const subscribe = () => () => {};
const getCode = () =>
  new URLSearchParams(window.location.search).get("code") ?? "";
const getServerCode = () => "";

type Outcome = "approved" | "denied" | null;

export default function CliAuthorizePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const code = useSyncExternalStore(subscribe, getCode, getServerCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cli/auth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: code, approve }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong.");
      setOutcome(approve ? "approved" : "denied");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded) return null;
  if (!isSignedIn) {
    const here = window.location.href;
    return (
      <RedirectToSignIn
        signInForceRedirectUrl={here}
        signUpForceRedirectUrl={here}
      />
    );
  }

  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="border border-border bg-surface p-6">
        <h1 className="text-[20px] font-semibold tracking-tight">
          Authorize the CLI
        </h1>

        {outcome ? (
          <p role="status" className="mt-3 text-[14px] leading-relaxed text-muted">
            {outcome === "approved"
              ? "Approved. You can return to your terminal."
              : "Denied. The CLI was not given access."}
          </p>
        ) : code ? (
          <>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              A terminal is asking to access your projects and secrets as you.
              Approve only if this code matches the one shown in your terminal.
            </p>
            <p className="mt-4 bg-code px-3 py-2 text-center font-mono text-[20px] tracking-widest">
              {code}
            </p>
            {error && (
              <p role="alert" className="mt-3 text-[13px] text-red-600">
                {error}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => decide(true)}
                disabled={busy}
                className="bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-60"
              >
                Approve
              </button>
              <button
                onClick={() => decide(false)}
                disabled={busy}
                className="border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink disabled:opacity-60"
              >
                Deny
              </button>
            </div>
          </>
        ) : (
          <p className="mt-3 text-[14px] text-muted">
            This link is missing its code. Run <code>keel login</code>{" "}
            again.
          </p>
        )}
      </div>
    </main>
  );
}
