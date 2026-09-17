import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { MAX_FLOWS, classify } from "../model.js";
import { route, validate } from "../middleware.js";
import { sensorGuard } from "../sensor.js";

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

const minuteOf = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

/** What the agent prints on boot, so a wrong key fails in the first second
 *  rather than silently at the first flush. */
ingestRouter.get(
  "/",
  route((req, res) => {
    const s = req.sensor!;
    res.json({ sensor: s.name, network: s.network.name, cidr: s.network.cidr });
  }),
);

ingestRouter.post(
  "/flows",
  route(async (req, res) => {
    const { flows, batch_id } = validate(body, req.body);
    const sensor = req.sensor!;

    // Answered, not reprocessed. The agent asked the same question twice
    // because it never heard the first answer; saying yes again is correct and
    // costs nothing, including an inference call.
    if (sensor.lastBatchId === batch_id) {
      res.json({ accepted: flows.length, attacks: 0, duplicate: true });
      return;
    }

    const verdicts = await classify(flows.map((f) => f.features));

    // Only attacks become rows. Benign volume becomes a counter, which is the
    // difference between a table that grows with attacks and one that grows
    // with traffic — the same batch at a quiet site writes nothing but a
    // single increment.
    const detections = flows
      .map((f, i) => ({ f, v: verdicts[i] }))
      .filter(({ v }) => v.attack !== "Normal")
      .map(({ f, v }) => ({
        sensorId: sensor.id,
        organizationId: sensor.network.office.organizationId,
        flowId: f.id,
        attack: v.attack,
        confidence: v.confidence,
        risk: v.risk,
        severity: v.severity,
        features: v.features,
        modelTag: v.model,
        sourceIp: f.source_ip,
        sourcePort: f.source_port,
        targetIp: f.target_ip,
        targetPort: f.target_port,
        protocol: f.protocol,
        startedAt: f.started_at,
      }));

    // One row per minute touched, usually one. Raw, because the increment has
    // to happen inside the conflict resolution: a read-then-write upsert loses
    // counts when two batches land in the same millisecond.
    const buckets = new Map<number, { flows: number; attacks: number; bytes: number }>();
    for (const [i, f] of flows.entries()) {
      const key = minuteOf(f.started_at).getTime();
      const b = buckets.get(key) ?? { flows: 0, attacks: 0, bytes: 0 };
      b.flows += 1;
      b.bytes += f.bytes;
      if (verdicts[i].attack !== "Normal") b.attacks += 1;
      buckets.set(key, b);
    }

    // One transaction, so a retry after a partial write cannot double-count:
    // either the detections are deduplicated and the counters move once, or
    // nothing happened and the agent's next attempt does all of it.
    await prisma.$transaction([
      prisma.detection.createMany({ data: detections, skipDuplicates: true }),
      ...[...buckets].map(
        ([ms, b]) => prisma.$executeRaw`
          INSERT INTO flow_rollups (id, sensor_id, minute, flows, attacks, bytes)
          VALUES (gen_random_uuid(), ${sensor.id}::uuid, ${new Date(ms)}, ${b.flows}, ${b.attacks}, ${b.bytes})
          ON CONFLICT (sensor_id, minute) DO UPDATE
            SET flows   = flow_rollups.flows   + EXCLUDED.flows,
                attacks = flow_rollups.attacks + EXCLUDED.attacks,
                bytes   = flow_rollups.bytes   + EXCLUDED.bytes`,
      ),
      prisma.sensor.update({
        where: { id: sensor.id },
        data: { lastSeenAt: new Date(), lastBatchId: batch_id },
      }),
    ]);

    res.json({ accepted: flows.length, attacks: detections.length });
  }),
);
