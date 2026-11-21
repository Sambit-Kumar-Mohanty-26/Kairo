/**
 * Kairo Active Mitigation & IPS Quarantine Routes.
 *
 * Exposes endpoints for managing host-level firewall drop policies,
 * inspecting active quarantines, and manual analyst triage override.
 */

import { Router } from "express";
import { z } from "zod";
import { authGuard, route, validate } from "../middleware.js";
import { mitigationService } from "../services/mitigationService.js";

export const mitigationRouter = Router();
mitigationRouter.use(authGuard);

const blockSchema = z.object({
  sourceIp: z.string().trim().min(1, "Source IP is required."),
  reason: z.string().trim().min(1, "Reason is required.").default("MANUAL_ANALYST_BLOCK"),
  attack: z.string().trim().optional(),
  risk: z.number().int().min(0).max(100).optional().default(90),
  severity: z.enum(["normal", "warning", "critical"]).optional().default("critical"),
  sensorId: z.string().uuid().optional(),
  expiresInMinutes: z.number().int().min(1).max(43200).optional(), // up to 30 days
});

const unblockSchema = z.object({
  ruleId: z.string().uuid().optional(),
  sourceIp: z.string().trim().optional(),
}).refine((data) => data.ruleId || data.sourceIp, {
  message: "Either ruleId or sourceIp must be provided to release quarantine.",
});

/**
 * List quarantine rules for the authenticated tenant.
 */
mitigationRouter.get(
  "/rules",
  route(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rules = await mitigationService.listQuarantines(req.user!.organizationId, status);
    res.json({ rules });
  }),
);

/**
 * Get active quarantine operational telemetry.
 */
mitigationRouter.get(
  "/status",
  route(async (req, res) => {
    const stats = await mitigationService.getQuarantineStats(req.user!.organizationId);
    res.json(stats);
  }),
);

/**
 * Enforce immediate active quarantine on an offending IP address.
 */
mitigationRouter.post(
  "/block",
  route(async (req, res) => {
    const body = validate(blockSchema, req.body);
    const result = await mitigationService.quarantineIp({
      organizationId: req.user!.organizationId,
      sourceIp: body.sourceIp,
      reason: body.reason ?? "MANUAL_ANALYST_BLOCK",
      attack: body.attack,
      risk: body.risk,
      severity: body.severity,
      sensorId: body.sensorId,
      expiresInMinutes: body.expiresInMinutes,
    });
    res.status(201).json(result);
  }),
);

/**
 * Release an IP address from active quarantine.
 */
mitigationRouter.post(
  "/unblock",
  route(async (req, res) => {
    const body = validate(unblockSchema, req.body);
    const result = await mitigationService.releaseIp({
      organizationId: req.user!.organizationId,
      ruleId: body.ruleId,
      sourceIp: body.sourceIp,
      unblockedBy: req.user?.email || "admin",
    });
    res.json(result);
  }),
);
