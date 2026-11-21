/**
 * Kairo Webhook Integrations & Enterprise Alerting Routes.
 *
 * Exposes endpoints for managing Discord, Slack, and SIEM webhooks,
 * testing delivery channels, and configuring alerting risk thresholds.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authGuard, requireRole, route, validate } from "../middleware.js";
import { notificationDispatcher } from "../services/notificationDispatcher.js";
import { auditService } from "../services/auditService.js";

export const notificationRouter = Router();
notificationRouter.use(authGuard);

const webhookCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  url: z.string().trim().url("Must be a valid HTTP or HTTPS URL.").max(512),
  format: z.enum(["discord", "slack", "generic"]).default("discord"),
  secret: z.string().trim().max(128).optional(),
  minRisk: z.number().int().min(0).max(100).default(70),
});

const testAlertSchema = z.object({
  url: z.string().trim().url("Valid URL required."),
  format: z.enum(["discord", "slack", "generic"]).default("discord"),
});

/**
 * List all configured notification webhooks for the tenant.
 */
notificationRouter.get(
  "/webhooks",
  route(async (req, res) => {
    const webhooks = await prisma.webhookEndpoint.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ webhooks });
  }),
);

/**
 * Register a new webhook endpoint.
 */
notificationRouter.post(
  "/webhooks",
  requireRole("owner", "admin"),
  route(async (req, res) => {
    const body = validate(webhookCreateSchema, req.body);
    const webhook = await prisma.webhookEndpoint.create({
      data: {
        organizationId: req.user!.organizationId,
        name: body.name,
        url: body.url,
        format: body.format,
        secret: body.secret,
        minRisk: body.minRisk,
        enabled: true,
      },
    });
    void auditService.log(req, {
      organizationId: req.user!.organizationId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: "WEBHOOK_ENDPOINT_CREATED",
      resourceType: "WebhookEndpoint",
      resourceId: webhook.id,
      details: { name: body.name, format: body.format, minRisk: body.minRisk },
    });
    res.status(201).json({ webhook });
  }),
);

/**
 * Delete a webhook endpoint.
 */
notificationRouter.delete(
  "/webhooks/:id",
  requireRole("owner", "admin"),
  route(async (req, res) => {
    await prisma.webhookEndpoint.deleteMany({
      where: {
        id: req.params.id,
        organizationId: req.user!.organizationId,
      },
    });
    void auditService.log(req, {
      organizationId: req.user!.organizationId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: "WEBHOOK_ENDPOINT_DELETED",
      resourceType: "WebhookEndpoint",
      resourceId: req.params.id,
    });
    res.json({ ok: true });
  }),
);

/**
 * Toggle enable/disable status of a webhook.
 */
notificationRouter.patch(
  "/webhooks/:id/toggle",
  route(async (req, res) => {
    const current = await prisma.webhookEndpoint.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    if (!current) {
      res.status(404).json({ error: "Webhook not found." });
      return;
    }
    const updated = await prisma.webhookEndpoint.update({
      where: { id: current.id },
      data: { enabled: !current.enabled },
    });
    res.json({ webhook: updated });
  }),
);

/**
 * Trigger an immediate live test alert to verify delivery.
 */
notificationRouter.post(
  "/test",
  route(async (req, res) => {
    const body = validate(testAlertSchema, req.body);
    const result = await notificationDispatcher.sendTestAlert(body.url, body.format);
    res.json(result);
  }),
);
