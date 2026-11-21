/**
 * Kairo Audit Trail API Routes (SOC 2 Type II Compliance).
 *
 * Exposes endpoints to inspect append-only audit logs and export
 * compliance audit trails in RFC-4180 CSV / JSON formats.
 */

import { Router } from "express";
import { authGuard, requireRole, route } from "../middleware.js";
import { auditService } from "../services/auditService.js";

export const auditRouter = Router();
auditRouter.use(authGuard);

/**
 * List paginated audit logs for the authenticated organization.
 * Accessible to any authenticated role (viewer, analyst, admin, owner).
 */
auditRouter.get(
  "/logs",
  requireRole("owner", "admin", "analyst", "viewer"),
  route(async (req, res) => {
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const actorEmail = typeof req.query.actor === "string" ? req.query.actor : undefined;
    const resourceType = typeof req.query.resource === "string" ? req.query.resource : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await auditService.listLogs(req.user!.organizationId, {
      action,
      actorEmail,
      resourceType,
      limit,
      offset,
    });
    res.json(result);
  }),
);

/**
 * Export audit logs as CSV for compliance auditors (SOC 2, ISO 27001).
 * Requires administrative privileges (admin, owner).
 */
auditRouter.get(
  "/export",
  requireRole("owner", "admin"),
  route(async (req, res) => {
    const csvData = await auditService.exportCsv(req.user!.organizationId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="kairo-audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csvData);
  }),
);
