import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, authGuard, route, validate } from "../middleware.js";
import { isLive } from "../sensor.js";

/* The console's read model for Live Mode. One request returns everything the
   dashboard renders, in the same shape the fixtures had — so switching modes
   swaps the producer, not the pages.

   Everything derivable stays derived here rather than stored: threat count,
   critical count and the risk index are all functions of the detection list,
   and a stored copy is a copy that can disagree with it. */
export const liveRouter = Router();
liveRouter.use(authGuard);

/** The log's window, and its cap. A site under a real flood produces more
 *  than this in a day; the cap is what keeps one bad night from sending a
 *  40 MB JSON payload to a browser. Newest first, so truncation drops the
 *  oldest rather than the interesting end. */
const WINDOW_MS = 24 * 60 * 60_000;
const MAX_ROWS = 500;

const STATUSES = ["new", "acknowledged", "investigating", "resolved", "false-positive"] as const;

liveRouter.get(
  "/",
  route(async (req, res) => {
    const organizationId = req.user!.organizationId;

    const [offices, detections, rollup] = await Promise.all([
      prisma.office.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        include: {
          networks: {
            include: {
              sensors: {
                where: { revokedAt: null },
                orderBy: { name: "asc" },
                select: { name: true, lastSeenAt: true },
              },
            },
          },
        },
      }),
      prisma.detection.findMany({
        where: { organizationId, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
        orderBy: { startedAt: "desc" },
        take: MAX_ROWS,
        include: {
          sensor: { select: { name: true, network: { select: { office: { select: { name: true } } } } } },
        },
      }),
      // Benign flows were never rows, so "flows analysed" comes from the
      // counters. Summing them is the whole reason they exist.
      // Same 24h window as the detection list above: the console says "24h"
      // and an all-time sum under that label is a wrong number, not a bigger one.
      prisma.flowRollup.aggregate({
        _sum: { flows: true },
        where: {
          minute: { gte: new Date(Date.now() - WINDOW_MS) },
          sensor: { network: { office: { organizationId } } },
        },
      }),
    ]);

    const sensors = offices.flatMap((o) => o.networks.flatMap((n) => n.sensors));

    res.json({
      org: req.user!.organization.name,
      traffic: rollup._sum.flows ?? 0,
      // The console flattens a network away: the operator picks an office and
      // reads a sensor name. Networks matter for attribution, not navigation.
      offices: offices.map((o) => ({
        name: o.name,
        sensors: o.networks.flatMap((n) => n.sensors.map((s) => s.name)),
      })),
      sensors_total: sensors.length,
      sensors_live: sensors.filter((s) => isLive(s.lastSeenAt)).length,
      detections: detections.map((d) => ({
        id: d.id,
        at: d.startedAt.getTime(),
        attack: d.attack,
        source: d.sourceIp,
        target: d.targetIp,
        office: d.sensor.network.office.name,
        sensor: d.sensor.name,
        confidence: d.confidence,
        risk: d.risk,
        severity: d.severity,
        features: d.features,
        status: d.status,
      })),
    });
  }),
);

/** Triage. The event row is the point: a resolved or false-positive verdict is
 *  a labelled flow going into the next retrain, so who labelled it and when is
 *  part of the training data, not UI history. */
liveRouter.patch(
  "/detections/:id",
  route(async (req, res) => {
    const { status } = validate(z.object({ status: z.enum(STATUSES) }), req.body);

    const { count } = await prisma.detection.updateMany({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      data: { status },
    });
    if (!count) throw new HttpError(404, "No such detection.");

    await prisma.detectionEvent.create({
      data: { detectionId: req.params.id, userId: req.user!.id, status },
    });
    res.json({ id: req.params.id, status });
  }),
);
