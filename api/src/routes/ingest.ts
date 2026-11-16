import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { MAX_FLOWS } from "../model.js";
import { HttpError, rateLimit, route, validate } from "../middleware.js";
import { computeSensorHealth, sensorGuard } from "../sensor.js";
import { ingestQueue } from "../services/ingestQueue.js";

/* Where Live Mode actually happens. An agent on the customer's network turns
   packets into the 30 features the model was trained on and posts them here;
   nothing else crosses the boundary — no payloads, no packets, no pcap.

   Authenticated by sensor key, so this is the only route in the product a
   machine outside our infrastructure is allowed to call. */
export const ingestRouter = Router();
ingestRouter.use(sensorGuard);

const flow = z.object({
  /** The agent's own id, so a batch retried after a timeout is deduplicated
   *  rather than double-counted. See the @@unique on (sensorId, flowId). */
  id: z.string().min(1).max(64),
  started_at: z.coerce.date(),
  source_ip: z.string().max(45),
  source_port: z.number().int().min(0).max(65535),
  target_ip: z.string().max(45),
  target_port: z.number().int().min(0).max(65535),
  protocol: z.string().max(8),
  bytes: z.number().int().min(0),
  /** Names come from the model, not from us — validating them here would mean
   *  duplicating the feature list and letting it drift. The service answers 422
   *  naming the missing feature, which is the agent's bug to fix, not ours. */
  features: z.record(z.number()),
});

const body = z.object({
  /** Stable across the agent's own retries of the same batch. Detection rows
   *  dedupe on (sensor, flow) by themselves, but the minute counters only know
   *  how to increment — so without this a lost response inflates "flows
   *  analysed" every time the agent tries again. */
  batch_id: z.string().min(1).max(64),
  flows: z
    .array(flow)
    .min(1, "Send at least one flow.")
    .max(MAX_FLOWS, `Send at most ${MAX_FLOWS} flows per batch.`),
});

const heartbeatSchema = z.object({
  version: z.string().max(32).optional(),
  uptime_seconds: z.number().int().min(0).optional(),
  interface: z.string().max(64).optional(),
  capture_status: z.string().max(30).optional(),
  packets_observed: z.number().int().min(0).optional(),
  flows_extracted: z.number().int().min(0).optional(),
  pending_batches: z.number().int().min(0).optional(),
  queue_bytes: z.number().int().min(0).optional(),
  warning: z.string().max(255).nullable().optional(),
});

const minuteOf = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

/** What the agent prints on boot, so a wrong key fails in the first second
 *  rather than silently at the first flush. Updates lastSeenAt so presence is recorded immediately. */
ingestRouter.get(
  "/",
  route(async (req, res) => {
    const s = req.sensor!;
    await prisma.sensor.update({
      where: { id: s.id },
      data: { lastSeenAt: new Date(), status: s.revokedAt ? "revoked" : "online" },
    });
    res.json({ sensor: s.name, network: s.network.name, cidr: s.network.cidr });
  }),
);

/** Operational heartbeat endpoint. Ingests health metrics from the sensor agent. */
ingestRouter.post(
  "/heartbeat",
  rateLimit({ windowMs: 60_000, max: 120 }),
  route(async (req, res) => {
    const sensor = req.sensor!;
    const data = validate(heartbeatSchema, req.body);
    const now = new Date();

    const computedStatus = computeSensorHealth({
      revokedAt: sensor.revokedAt,
      lastSeenAt: now,
      pendingBatches: data.pending_batches,
      recentWarning: data.warning,
      captureStatus: data.capture_status,
    });

    await prisma.$transaction([
      prisma.sensor.update({
        where: { id: sensor.id },
        data: {
          lastSeenAt: now,
          lastHeartbeatAt: now,
          status: computedStatus,
          version: data.version ?? sensor.version,
          captureStatus: data.capture_status ?? sensor.captureStatus,
          interfaceName: data.interface ?? sensor.interfaceName,
          packetsObserved: data.packets_observed !== undefined ? BigInt(data.packets_observed) : sensor.packetsObserved,
          flowsExtracted: data.flows_extracted !== undefined ? BigInt(data.flows_extracted) : sensor.flowsExtracted,
          pendingBatches: data.pending_batches ?? sensor.pendingBatches,
          queueBytes: data.queue_bytes !== undefined ? BigInt(data.queue_bytes) : sensor.queueBytes,
          recentWarning: data.warning !== undefined ? data.warning : sensor.recentWarning,
        },
      }),
      prisma.sensorHeartbeat.create({
        data: {
          sensorId: sensor.id,
          createdAt: now,
          status: computedStatus,
          captureStatus: data.capture_status ?? null,
          packetsObserved: BigInt(data.packets_observed ?? 0),
          flowsExtracted: BigInt(data.flows_extracted ?? 0),
          pendingBatches: data.pending_batches ?? 0,
          queueBytes: BigInt(data.queue_bytes ?? 0),
          warning: data.warning ?? null,
        },
      }),
    ]);

    res.json({ ok: true, status: computedStatus, acknowledged_at: now.toISOString() });
  }),
);

ingestRouter.get(
  "/queue/stats",
  route(async (_req, res) => {
    res.json(ingestQueue.getMetrics());
  }),
);

ingestRouter.get(
  "/queue/dead-letters",
  route(async (_req, res) => {
    res.json({ dead_letters: ingestQueue.getDeadLetters() });
  }),
);

ingestRouter.post(
  "/flows",
  rateLimit({ windowMs: 60_000, max: 120 }),
  route(async (req, res) => {
    const { flows, batch_id } = validate(body, req.body);
    const sensor = req.sensor!;

    // Check multi-batch idempotency table first, then fallback to lastBatchId
    if (sensor.lastBatchId === batch_id) {
      res.json({ accepted: flows.length, attacks: 0, duplicate: true });
      return;
    }

    const existingBatch = await prisma.ingestedBatch.findUnique({
      where: { sensorId_batchId: { sensorId: sensor.id, batchId: batch_id } },
    });
    if (existingBatch) {
      res.json({ accepted: flows.length, attacks: 0, duplicate: true });
      return;
    }

    // Check Backpressure
    if (!ingestQueue.canEnqueue()) {
      res.set("Retry-After", "5");
      throw new HttpError(429, "Ingestion queue overloaded. Edge backpressure active; retry shortly.");
    }

    const isAsync = req.query.async === "true" || req.headers["x-kairo-async"] === "true";

    if (isAsync) {
      const job = ingestQueue.enqueue({
        sensorId: sensor.id,
        organizationId: sensor.network.office.organizationId,
        batchId: batch_id,
        flows,
      });
      res.status(202).json({
        accepted: flows.length,
        status: "queued",
        job_id: job.id,
        queue_depth: ingestQueue.getMetrics().queueDepth,
      });
      return;
    }

    // Synchronous execution using worker execution engine
    const result = await ingestQueue.executeJob({
      id: `sync_${Date.now()}`,
      sensorId: sensor.id,
      organizationId: sensor.network.office.organizationId,
      batchId: batch_id,
      flows,
      enqueuedAt: new Date(),
      retries: 0,
      maxRetries: 0,
    });

    res.json(result);
  }),
);
