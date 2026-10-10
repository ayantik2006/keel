"use client";

import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { api, errorMessage } from "./api";
import { ConfirmDeleteDialog } from "./Dialogs";
import { Card, Row, Rows, ghostButton } from "./SettingsUI";
import { dateFormat, type CliSession } from "./types";

const small =
  "border border-[#B8B8B2] px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-60";

export default function AccountSettings({ flash }: { flash: (m: string) => void }) {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();

  const [tick, setTick] = useState(0);
  const [data, setData] = useState<{
    tick: number;
    sessions?: CliSession[];
    error?: string;
  } | null>(null);
  const ready = data?.tick === tick;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listCliSessions()
      .then((sessions) => alive && setData({ tick, sessions }))
      .catch((e) => alive && setData({ tick, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [tick]);

  async function revoke(s: CliSession) {
    setBusy(s.id);
    try {
      await api.revokeCliSession(s.id);
      flash(`Signed out ${s.deviceName}`);
    } catch (e) {
      flash(errorMessage(e));
    } finally {
      setBusy(null);
      setTick((n) => n + 1);
    }
  }

  async function revokeAll(): Promise<string | null> {
    try {
      const { revoked } = await api.revokeAllCliSessions();
      flash(`Signed out ${revoked} command line session${revoked === 1 ? "" : "s"}`);
      setTick((n) => n + 1);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }

  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="space-y-6">
      <Card
        title="Profile"
        description="Managed by your sign-in provider."
        footer={
          <>
            <p className="text-[12px] text-muted">
              Name, email and password are changed in your account portal.
            </p>
            <div className="flex gap-2">
              <button onClick={() => clerk.openUserProfile()} className={ghostButton}>
                Manage account
              </button>
              <button
                onClick={() => clerk.signOut({ redirectUrl: "/" })}
                className={ghostButton}
              >
                Sign out
              </button>
            </div>
          </>
        }
      >
        {!isLoaded ? (
          <div className="m-5 h-24 animate-pulse bg-code" />
        ) : (
          <Rows>
            <Row label="Name">
              {user?.fullName || <span className="text-muted">Not set</span>}
            </Row>
            <Row label="Email">
              <span className="break-all">
                {email ?? <span className="text-muted">Not available</span>}
              </span>
            </Row>
            <Row label="Account created">
              {user?.createdAt ? dateFormat.format(user.createdAt) : "Not available"}
            </Row>
          </Rows>
        )}
      </Card>

      <Card
        title="Command line sessions"
        description="Machines where you are signed in with the Keel CLI."
        action={
          ready && data.sessions && data.sessions.length > 0 ? (
            <button onClick={() => setConfirmAll(true)} className={ghostButton}>
              Sign out everywhere
            </button>
          ) : undefined
        }
      >
        {!ready && <div className="m-5 h-5 animate-pulse bg-code" />}
        {ready && data.error && (
          <p role="alert" className="px-5 py-6 text-center text-[13px] text-red-600">
            {data.error}
          </p>
        )}
        {ready && data.sessions?.length === 0 && (
          <p className="px-5 py-8 text-center text-[13px] text-muted">
            No active command line sessions. Run{" "}
            <code className="bg-code px-1 py-0.5 font-mono text-[12px] text-ink">keel login</code>{" "}
            to start one.
          </p>
        )}
        <ul className="divide-y divide-border">
          {ready &&
            data.sessions?.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{s.deviceName}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    Last used {dateFormat.format(new Date(s.lastUsedAt))} &middot; expires{" "}
                    {dateFormat.format(new Date(s.expiresAt))}
                  </p>
                </div>
                <button onClick={() => revoke(s)} disabled={busy === s.id} className={small}>
                  {busy === s.id ? "Signing out..." : "Sign out"}
                </button>
              </li>
            ))}
        </ul>
      </Card>

      {confirmAll && (
        <ConfirmDeleteDialog
          title="Sign out everywhere"
          name="all command line sessions"
          verb="sign out of"
          actionLabel="Sign out"
          warning="Each machine will need to run keel login again."
          onConfirm={revokeAll}
          onClose={() => setConfirmAll(false)}
        />
      )}
    </div>
  );
}
