import "server-only";
import { randomUUID } from "node:crypto";
import { collections } from "./db";

export type AuditAction =
  | "project.created"
  | "member.role_changed"
  | "member.removed"
  | "member.left"
  | "invitation.created"
  | "invitation.revoked"
  | "invitation.accepted"
  | "environment.access_granted"
  | "environment.access_revoked"
  | "environment.access_denied"
  | "secret.rolled_back"
  | "secret.created"
  | "secret.updated"
  | "secret.deleted"
  | "secrets.exported"
  | "secrets.imported"
  | "secret.revealed"
  | "secret.version_revealed"
  | "project.updated"
  | "project.deleted"
  | "integration.connected"
  | "integration.updated"
  | "integration.disconnected"
  | "integration.synced"
  | "integration.deploy_triggered";

/**
 * Append-only record of access-control changes. Metadata must never contain
 * secret values, invitation tokens, or token hashes.
 */
export async function recordAudit(event: {
  projectId: string;
  actorId: string;
  action: AuditAction;
  targetType: "member" | "invitation" | "project" | "environment" | "secret" | "integration";
  targetId: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const { auditLogs } = await collections();
  await auditLogs.insertOne({
    _id: randomUUID(),
    ...event,
    metadata: event.metadata ?? {},
    at: new Date(),
  });
}

/**
 * Like recordAudit, but skips the write if the same actor already produced the
 * same action on the same target within the window. Used for denied attempts
 * so repeated requests cannot flood the log.
 */
export async function recordAuditOnce(
  event: Parameters<typeof recordAudit>[0],
  windowMs = 60_000,
) {
  const { auditLogs } = await collections();
  const recent = await auditLogs.findOne({
    projectId: event.projectId,
    actorId: event.actorId,
    action: event.action,
    targetId: event.targetId,
    at: { $gt: new Date(Date.now() - windowMs) },
  });
  if (!recent) await recordAudit(event);
}
