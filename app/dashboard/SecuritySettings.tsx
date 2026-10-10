"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import { Card as BaseCard, Row, Rows } from "./SettingsUI";
import { envLabel, type SecurityOverview } from "./types";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <BaseCard title={title}>
      <Rows>{children}</Rows>
    </BaseCard>
  );
}

const Yes = ({ children }: { children: React.ReactNode }) => (
  <span className="bg-code px-1.5 py-0.5 text-[12px]">{children}</span>
);
const No = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted">{children}</span>
);

export default function SecuritySettings({ projectId }: { projectId: string }) {
  const [state, setState] = useState<{
    projectId: string;
    data?: SecurityOverview;
    error?: string;
  } | null>(null);
  const ready = state?.projectId === projectId;

  useEffect(() => {
    let alive = true;
    api
      .security(projectId)
      .then((data) => alive && setState({ projectId, data }))
      .catch((e) => alive && setState({ projectId, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (!ready) return <div className="h-40 animate-pulse bg-code" />;
  if (state.error)
    return (
      <p role="alert" className="text-[13px] text-red-600">
        {state.error}
      </p>
    );
  const s = state.data!;
  const e = s.encryption;

  return (
    <div className="space-y-6">
      <Card title="Secret encryption">
        <Row label="At rest">
          <Yes>Encrypted</Yes>{" "}
          <span className="text-muted">
            Every secret value and its history is stored as {e.algorithm} ciphertext.
          </span>
        </Row>
        <Row label="Encryption key">
          {e.keyConfigured ? (
            <Yes>Configured</Yes>
          ) : (
            <span className="text-red-700">Not configured or invalid. Secrets cannot be read.</span>
          )}{" "}
          <span className="text-muted">{e.keyStorage}.</span>
        </Row>
        <Row label="Key version">
          v{e.currentKeyVersion}
          <span className="ml-2 text-muted">
            {e.records.onCurrentKeyVersion} of {e.records.total} secret
            {e.records.total === 1 ? "" : "s"} use the current version
            {e.records.other > 0 && `, ${e.records.other} use another`}.
          </span>
        </Row>
        <Row label="Key rotation">
          <No>Not available. Re-encryption tooling has not been built.</No>
        </Row>
        <Row label="External KMS or HSM">
          <No>Not used. The key is held by the server environment.</No>
        </Row>
      </Card>

      <Card title="Authentication">
        <Row label="Provider">{s.authentication.provider}</Row>
        <Row label="Sessions and passwords">
          <span className="text-muted">{s.authentication.note}</span>
        </Row>
        <Row label="Command line access">
          Access tokens last {s.authentication.cliAccessTokenMinutes} minutes and refresh
          tokens {s.authentication.cliRefreshTokenDays} days. Each person can revoke their
          own sessions under Account.
        </Row>
        <Row label="API keys and machine credentials">
          <No>Not available. Access is tied to individual users.</No>
        </Row>
      </Card>

      <Card title="Access control">
        <Row label="Members">
          {(["owner", "admin", "member", "viewer"] as const).map((r) => (
            <span key={r} className="mr-4 inline-block capitalize">
              {s.access.members[r]} {r}
              {s.access.members[r] === 1 ? "" : "s"}
            </span>
          ))}
        </Row>
        <Row label="Pending invitations">{s.access.pendingInvitations}</Row>
        <Row label="Environment access">
          {s.access.environments.length === 0 ? (
            <No>No environments.</No>
          ) : (
            <ul className="space-y-1">
              {s.access.environments.map((env) => (
                <li key={env.slug}>
                  <span className="font-medium">{envLabel(env.slug)}</span>{" "}
                  <span className="text-muted">
                    {env.membersAndViewersTotal === 0
                      ? "owners and admins only (no members or viewers)"
                      : env.membersAndViewersWithAccess === 0
                        ? "restricted to owners and admins"
                        : `${env.membersAndViewersWithAccess} of ${env.membersAndViewersTotal} members and viewers have access`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Row>
      </Card>

      <Card title="Integrations and audit">
        <Row label="Vercel">
          {s.integrations.vercel ? (
            <>
              <Yes>{s.integrations.vercel.status}</Yes>
              {s.integrations.vercel.project && (
                <span className="ml-2 text-muted">{s.integrations.vercel.project}</span>
              )}
              <span className="ml-2 text-muted">
                The access token is stored encrypted and is never shown.
              </span>
            </>
          ) : (
            <No>Not connected.</No>
          )}
        </Row>
        <Row label="Audit log">
          {s.auditLog.events} event{s.auditLog.events === 1 ? "" : "s"} recorded.{" "}
          <span className="text-muted">{s.auditLog.retention}.</span>
        </Row>
      </Card>
    </div>
  );
}
