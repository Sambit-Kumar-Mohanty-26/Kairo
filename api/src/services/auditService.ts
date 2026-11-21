/**
 * Kairo SOC 2 Type II Immutable Audit Trail Service.
 *
 * Enforces tamper-resistant, append-only audit logging for:
 * - Authentication & Session modifications
 * - Sensor key generation & revocation
 * - Active IPS firewall quarantine & unblock decisions
 * - Incident triage verdict mutations
 * - Webhook & Integration lifecycle modifications
 * - Tenant settings & team role alterations
 */

import { Request } from "express";
import { prisma } from "../db.js";

export interface AuditEntry {
  organizationId: string;
  actorId?: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditService {
  /**
   * Record an immutable audit log entry.
   * Safe asynchronous execution that never throws into the critical user path.
   */
  public async log(req: Request | null, entry: Omit<AuditEntry, "ipAddress" | "userAgent">): Promise<void> {
    try {
      const ipAddress = req ? (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || null : null;
      const userAgent = req ? (req.headers["user-agent"] as string) || null : null;

      await prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          actorId: entry.actorId || null,
          actorEmail: entry.actorEmail,
          actorRole: entry.actorRole,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId || null,
          details: entry.details || undefined,
          ipAddress: ipAddress ? ipAddress.slice(0, 45) : null,
          userAgent: userAgent ? userAgent.slice(0, 255) : null,
        },
      });
    } catch (err) {
      console.error("[Audit Service] Failed to persist audit entry:", err);
    }
  }

  /**
   * Query audit logs with tenant isolation and optional filtering.
   */
  public async listLogs(
    organizationId: string,
    options: {
      action?: string;
      actorEmail?: string;
      resourceType?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { action, actorEmail, resourceType, limit = 50, offset = 0 } = options;

    const where: any = { organizationId };
    if (action) where.action = action;
    if (actorEmail) where.actorEmail = { contains: actorEmail, mode: "insensitive" };
    if (resourceType) where.resourceType = resourceType;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(limit, 200),
        skip: offset,
      }),
    ]);

    return { total, logs, limit, offset };
  }

  /**
   * Export audit trail in standard CSV format for SOC 2 auditors.
   */
  public async exportCsv(organizationId: string): Promise<string> {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });

    const headers = [
      "Timestamp (UTC)",
      "Action",
      "Actor Email",
      "Actor Role",
      "Resource Type",
      "Resource ID",
      "Client IP",
      "Details",
    ];

    const rows = logs.map((l) => [
      l.createdAt.toISOString(),
      `"${l.action.replace(/"/g, '""')}"`,
      `"${l.actorEmail.replace(/"/g, '""')}"`,
      `"${l.actorRole}"`,
      `"${l.resourceType}"`,
      `"${l.resourceId || ""}"`,
      `"${l.ipAddress || ""}"`,
      `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }
}

export const auditService = new AuditService();
