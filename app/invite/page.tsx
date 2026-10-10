"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { api, errorMessage } from "../dashboard/api";

// The invitation token lives in the URL fragment, which browsers never send to
// a server, so it does not appear in request logs.
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const getToken = () => window.location.hash.slice(1);
const getServerToken = () => "";

export default function InvitePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const token = useSyncExternalStore(subscribe, getToken, getServerToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api.acceptInvitation(token);
      window.history.replaceState(null, "", window.location.pathname);
      router.push("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!isLoaded) return null;
  if (!isSignedIn) {
    // Sign in, then come back to this exact link (including the fragment).
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
          Project invitation
        </h1>
        {token ? (
          <>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Accept this invitation to join the project. You must be signed in
              with the email address the invitation was sent to.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-[13px] text-red-600">
                {error}
              </p>
            )}
            <button
              onClick={accept}
              disabled={busy}
              className="mt-5 bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Accepting..." : "Accept invitation"}
            </button>
          </>
        ) : (
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            This link is missing its invitation code. Ask the project admin to
            send a new invitation.
          </p>
        )}
      </div>
    </main>
  );
}
