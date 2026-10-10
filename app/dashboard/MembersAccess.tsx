"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import EnvironmentPicker from "./EnvironmentPicker";
import Select from "./Select";
import { ConfirmDeleteDialog } from "./Dialogs";
import { CopyIcon, TrashIcon } from "./icons";
import { Card, ghostButton, inputClass, primaryButton } from "./SettingsUI";
import {
  dateFormat,
  hasPermission,
  envLabel,
  type EnvironmentAccessMatrix,
  type Invitation,
  type Member,
  type Project,
  type Role,
} from "./types";

type Props = {
  project: Project;
  flash: (message: string) => void;
  /** Called after the signed-in user leaves the project. */
  onLeft: (projectId: string) => void;
};

const ASSIGNABLE: Exclude<Role, "owner">[] = ["admin", "member", "viewer"];
const ROLE_OPTIONS = ASSIGNABLE.map((r) => ({ value: r, label: r }));

const ROLE_HELP: Record<Role, string> = {
  owner: "Full control, including deleting the project.",
  admin: "Manages settings, members, and secrets.",
  member: "Reads and changes secrets.",
  viewer: "Read-only access.",
};

export default function MembersAccess({ project, flash, onLeft }: Props) {
  const canInvite = hasPermission(project, "members:invite");
  const canChangeRoles = hasPermission(project, "members:update_role");
  const canRemove = hasPermission(project, "members:remove");
  const canSeeInvites = hasPermission(project, "invitations:read");
  const canRevoke = hasPermission(project, "invitations:revoke");
  const canManageEnvs = hasPermission(project, "environments:manage");

  const [tick, setTick] = useState(0);
  const [data, setData] = useState<{
    key: string;
    members?: Member[];
    invitations?: Invitation[];
    error?: string;
  } | null>(null);
  const key = `${project.id}:${tick}`;
  const ready = data !== null && data.key === key;

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("member");
  const [inviteEnvs, setInviteEnvs] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const [matrix, setMatrix] = useState<{
    key: string;
    data?: EnvironmentAccessMatrix;
    error?: string;
  } | null>(null);
  const [accessTick, setAccessTick] = useState(0);
  const [envChoice, setEnvChoice] = useState("production");
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const matrixKey = `${project.id}:${accessTick}`;
  const matrixReady = matrix !== null && matrix.key === matrixKey;

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.listMembers(project.id),
      canSeeInvites ? api.listInvitations(project.id) : Promise.resolve([]),
    ])
      .then(([members, invitations]) => {
        if (alive) setData({ key, members, invitations });
      })
      .catch((err) => {
        if (alive) setData({ key, error: errorMessage(err) });
      });
    return () => {
      alive = false;
    };
  }, [project.id, canSeeInvites, key]);

  useEffect(() => {
    if (!canManageEnvs) return;
    let alive = true;
    api
      .getEnvironmentAccess(project.id)
      .then((data) => alive && setMatrix({ key: matrixKey, data }))
      .catch(
        (err) => alive && setMatrix({ key: matrixKey, error: errorMessage(err) }),
      );
    return () => {
      alive = false;
    };
  }, [project.id, canManageEnvs, matrixKey]);

  const reload = () => setTick((n) => n + 1);

  async function toggleAccess(userId: string, env: string, grant: boolean) {
    setBusyUser(userId);
    try {
      await api.setEnvironmentAccess(project.id, env, userId, grant);
      flash(grant ? "Access granted" : "Access revoked");
    } catch (err) {
      flash(errorMessage(err));
    } finally {
      setBusyUser(null);
      setAccessTick((n) => n + 1);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      const res = await api.createInvitation(project.id, {
        email,
        role,
        ...(role !== "admin" && inviteEnvs.length > 0 ? { environments: inviteEnvs } : {}),
      });
      setEmail("");
      setInviteEnvs([]);
      setDevLink(res.devAcceptUrl ?? null);
      flash(`Invitation created for ${res.invitation.email}`);
      reload();
    } catch (err) {
      setInviteError(errorMessage(err));
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(member: Member, next: Role) {
    try {
      await api.updateMemberRole(project.id, member.userId, next);
      flash("Role updated");
    } catch (err) {
      flash(errorMessage(err));
    }
    reload();
  }

  async function revoke(invitation: Invitation) {
    try {
      await api.revokeInvitation(project.id, invitation.id);
      flash(`Revoked invitation for ${invitation.email}`);
    } catch (err) {
      flash(errorMessage(err));
    }
    reload();
  }

  async function confirmRemove(member: Member): Promise<string | null> {
    try {
      await api.removeMember(project.id, member.userId);
      if (member.isYou) {
        onLeft(project.id);
      } else {
        flash("Member removed");
        reload();
      }
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  async function copyLink() {
    if (!devLink) return;
    try {
      await navigator.clipboard.writeText(devLink);
      flash("Invitation link copied");
    } catch {
      flash("Could not access the clipboard");
    }
  }

  const label = (m: Member) => m.name ?? m.email ?? `User ${m.userId.slice(-6)}`;

  const memberCount = ready ? (data.members?.length ?? 0) : null;
  const inviteCount = ready ? (data.invitations?.length ?? 0) : null;

  return (
    <div className="space-y-6">
      <Card
        title="Members"
        description={
          memberCount === null
            ? "People with access to this project."
            : `${memberCount} ${memberCount === 1 ? "person has" : "people have"} access to this project.`
        }
      >
        {canInvite && (
          <div className="border-b border-border bg-code/40 px-5 py-4">
            <form onSubmit={invite} noValidate className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="invite-email" className="sr-only">
                Email address to invite
              </label>
              <input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setInviteError(null);
                }}
                placeholder="Invite by email, e.g. teammate@company.com"
                aria-invalid={inviteError ? true : undefined}
                aria-describedby="invite-help"
                className={`${inputClass} min-w-0 flex-1`}
              />
              <label htmlFor="invite-role" className="sr-only">
                Role
              </label>
              <Select
                id="invite-role"
                value={role}
                onChange={setRole}
                options={ROLE_OPTIONS}
                capitalize
                className="w-full sm:w-32"
              />
              {canManageEnvs && (
                <EnvironmentPicker
                  aria-label="Environment access"
                  options={project.environments.map((s) => ({ value: s, label: envLabel(s) }))}
                  value={inviteEnvs}
                  onChange={setInviteEnvs}
                  lockedLabel={role === "admin" ? "All environments" : undefined}
                  className="w-full sm:w-44"
                />
              )}
              <button
                type="submit"
                disabled={inviting || email.trim().length === 0}
                className={`${primaryButton} shrink-0`}
              >
                {inviting ? "Sending..." : "Send invite"}
              </button>
            </form>
            <p
              id="invite-help"
              role={inviteError ? "alert" : undefined}
              className={`mt-2 text-[12px] ${inviteError ? "text-red-600" : "text-muted"}`}
            >
              {inviteError ?? (
                <>
                  <span className="font-medium capitalize text-ink">{role}</span>
                  {": "}
                  {ROLE_HELP[role]}
                  {canManageEnvs && role !== "admin" && (
                    <>
                      {" "}
                      {inviteEnvs.length === 0
                        ? "No environment access until you grant it."
                        : `Access to ${project.environments
                            .filter((s) => inviteEnvs.includes(s))
                            .map(envLabel)
                            .join(", ")}.`}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        )}

        {devLink && (
          <div className="border-b border-accent/40 bg-accent-soft px-5 py-4">
            <p className="text-[13px] font-medium">Invitation link (shown once)</p>
            <p className="mt-0.5 text-[12px] text-muted">
              Email delivery is off. Share this link with the invited person.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate bg-surface px-2.5 py-2 font-mono text-[12px]">
                {devLink}
              </code>
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy invitation link"
                title="Copy link"
                className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#B8B8B2] bg-surface transition-colors hover:border-ink"
              >
                <CopyIcon />
              </button>
              <button type="button" onClick={() => setDevLink(null)} className={ghostButton}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!ready && (
          <div aria-hidden="true" className="space-y-3 px-5 py-4">
            <div className="h-9 animate-pulse bg-code" />
            <div className="h-9 animate-pulse bg-code" />
          </div>
        )}

        {ready && data.error && (
          <div role="alert" className="px-6 py-10 text-center">
            <p className="text-[14px] font-medium">Could not load members</p>
            <p className="mt-1 text-[13px] text-muted">{data.error}</p>
            <button onClick={reload} className={`${ghostButton} mt-3`}>
              Try again
            </button>
          </div>
        )}

        <ul className="divide-y divide-border">
          {ready &&
            data.members?.map((m) => {
              const editable = canChangeRoles && !m.isYou && m.role !== "owner";
              const removable = m.role !== "owner" && (m.isYou || canRemove);
              return (
                <li key={m.userId} className="flex items-center gap-3 px-5 py-3.5">
                  <Initial text={label(m)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {label(m)}
                      {m.isYou && (
                        <span className="ml-2 bg-code px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted">
                          You
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {m.name && m.email ? `${m.email} · ` : ""}Joined{" "}
                      {dateFormat.format(new Date(m.createdAt))}
                    </p>
                  </div>
                  {editable ? (
                    <Select
                      aria-label={`Role for ${label(m)}`}
                      value={m.role}
                      onChange={(r) => changeRole(m, r)}
                      options={ROLE_OPTIONS}
                      size="sm"
                      capitalize
                      className="w-28 shrink-0"
                    />
                  ) : (
                    <span className="w-28 shrink-0 px-2.5 text-[13px] capitalize text-muted">
                      {m.role}
                    </span>
                  )}
                  <div className="flex w-14 shrink-0 justify-end">
                    {removable &&
                      (m.isYou ? (
                        <button
                          onClick={() => setRemoving(m)}
                          className="text-[13px] font-medium text-muted transition-colors hover:text-red-600"
                        >
                          Leave
                        </button>
                      ) : (
                        <button
                          aria-label={`Remove ${label(m)}`}
                          title={`Remove ${label(m)}`}
                          onClick={() => setRemoving(m)}
                          className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-code hover:text-red-600"
                        >
                          <TrashIcon />
                        </button>
                      ))}
                  </div>
                </li>
              );
            })}
        </ul>
      </Card>

      {canSeeInvites && (
        <Card
          title="Pending invitations"
          description={
            inviteCount === null || inviteCount === 0
              ? "Invitations that have not been accepted yet."
              : `${inviteCount} waiting to be accepted.`
          }
        >
          {ready && !data.error && data.invitations?.length === 0 && (
            <p className="px-5 py-8 text-center text-[13px] text-muted">
              No pending invitations.
            </p>
          )}
          <ul className="divide-y divide-border">
            {ready &&
              data.invitations?.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Initial text={i.email} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{i.email}</p>
                    <p className="truncate text-[12px] text-muted">
                      <span className="capitalize">{i.role}</span> &middot;{" "}
                      {i.role !== "admin" && (
                        <>
                          {i.environments && i.environments.length > 0
                            ? i.environments.map(envLabel).join(", ")
                            : "No environments"}{" "}
                          &middot;{" "}
                        </>
                      )}
                      {i.expired ? (
                        <span className="text-red-600">Expired</span>
                      ) : (
                        `Expires ${dateFormat.format(new Date(i.expiresAt))}`
                      )}
                    </p>
                  </div>
                  {canRevoke && (
                    <button onClick={() => revoke(i)} className={ghostButton}>
                      Revoke
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </Card>
      )}

      {canManageEnvs && (
        <EnvironmentAccess
          matrix={matrix}
          ready={matrixReady}
          envChoice={envChoice}
          onEnvChange={setEnvChoice}
          busyUser={busyUser}
          onToggle={toggleAccess}
        />
      )}

      {removing && (
        <ConfirmDeleteDialog
          title={removing.isYou ? "Leave project" : "Remove member"}
          name={removing.isYou ? project.name : label(removing)}
          verb={removing.isYou ? "leave" : "remove"}
          actionLabel={removing.isYou ? "Leave" : "Remove"}
          warning={
            removing.isYou
              ? "You will lose access until someone invites you again."
              : "They will lose access to this project immediately."
          }
          onConfirm={() => confirmRemove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function Initial({ text }: { text: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center bg-code text-[13px] font-semibold uppercase text-muted"
    >
      {text.trim().charAt(0) || "?"}
    </span>
  );
}

type MatrixState = {
  key: string;
  data?: EnvironmentAccessMatrix;
  error?: string;
} | null;

function EnvironmentAccess({
  matrix,
  ready,
  envChoice,
  onEnvChange,
  busyUser,
  onToggle,
}: {
  matrix: MatrixState;
  ready: boolean;
  envChoice: string;
  onEnvChange: (env: string) => void;
  busyUser: string | null;
  onToggle: (userId: string, env: string, grant: boolean) => void;
}) {
  const data = ready ? matrix?.data : undefined;
  const envs = data?.environments ?? [];
  const env = envs.includes(envChoice) ? envChoice : envs[0];

  const restricted = data
    ? data.members.filter((m) => m.role === "member" || m.role === "viewer")
    : [];
  const granted = env ? restricted.filter((m) => m.access[env] === "granted").length : 0;

  return (
    <Card
      title="Environment access"
      description="Members and viewers only reach the environments you grant them. Owners and admins reach all."
      action={
        env ? (
          <Select
            aria-label="Environment"
            value={env}
            onChange={onEnvChange}
            options={envs.map((s) => ({ value: s, label: envLabel(s) }))}
            size="sm"
            className="w-40"
          />
        ) : undefined
      }
    >
      {!ready && <div className="m-5 h-20 animate-pulse bg-code" />}
      {ready && matrix?.error && (
        <p role="alert" className="px-5 py-6 text-[13px] text-red-600">
          {matrix.error}
        </p>
      )}
      {data && env && (
        <>
          <p className="border-b border-border px-5 py-2.5 text-[12px] text-muted">
            {granted === 0
              ? "Restricted to owners and admins."
              : `${granted} of ${restricted.length} members and viewers can access ${envLabel(env)}.`}
          </p>
          <ul className="divide-y divide-border">
            {data.members.map((m) => {
              const state = m.access[env];
              const grantable = m.role === "member" || m.role === "viewer";
              const name = m.email ?? `User ${m.userId.slice(-6)}`;
              const level = m.secretPermissions.includes("secrets:create")
                ? "Read and write"
                : "Read only";
              const caption =
                state === "none"
                  ? "No access"
                  : state === "implicit"
                    ? `All environments · ${level}`
                    : level;
              return (
                <li key={m.userId} className="flex items-center gap-3 px-5 py-3.5">
                  <Initial text={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {name}
                      {m.isYou && (
                        <span className="ml-2 bg-code px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted">
                          You
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      <span className="capitalize">{m.role}</span> &middot; {caption}
                    </p>
                  </div>
                  {grantable ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={state === "granted"}
                      aria-label={`${envLabel(env)} access for ${name}`}
                      disabled={busyUser === m.userId}
                      onClick={() => onToggle(m.userId, env, state !== "granted")}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        state === "granted" ? "bg-accent" : "bg-[#B8B8B2]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                          state === "granted" ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                  ) : (
                    <span className="shrink-0 text-[12px] text-muted">Always</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
