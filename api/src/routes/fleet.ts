import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, authGuard, route, validate } from "../middleware.js";
import { computeSensorHealth, isLive, newSensorKey } from "../sensor.js";

/* Offices, networks and sensors — the estate the console draws and the agent
   registers against. Guarded, unlike /ml: Test Mode is a demo anyone may click
   through, but this is one tenant's real topology. Every handler scopes by
   req.user.organizationId, and the scoping is in the `where` clause rather
   than in an `if` after the read, so there is no window between the check and
   the write. */
export const fleetRouter = Router();
fleetRouter.use(authGuard);

const name = z.string().trim().min(1, "Give it a name.").max(120);

/** Enough of a check to catch a typo, not a second IP library. A bad mask
 *  costs an attribution, not a verdict — the agent reports the addresses and
 *  the console can still show them. */
const cidr = z
  .string()
  .trim()
  .max(43)
  .regex(/^[0-9a-fA-F.:]+\/\d{1,3}$/, "Use CIDR notation, like 10.20.0.0/16.");

const serialiseSensor = (s: {
  id: string;
  name: string;
  lastSeenAt: Date | null;
  revokedAt?: Date | null;
  version?: string | null;
  captureStatus?: string | null;
  interfaceName?: string | null;
  packetsObserved?: bigint | null;
  flowsExtracted?: bigint | null;
  pendingBatches?: number | null;
  queueBytes?: bigint | null;
  lastHeartbeatAt?: Date | null;
  lastUploadAt?: Date | null;
  recentWarning?: string | null;
}) => {
  const health = computeSensorHealth(s);
  return {
    id: s.id,
    name: s.name,
    last_seen_at: s.lastSeenAt,
    live: health === "online" || health === "degraded",
    status: health,
    version: s.version ?? "0.1.0",
    capture_status: s.captureStatus ?? (health === "pending" ? "unregistered" : "idle"),
    interface: s.interfaceName ?? "default",
    packets_observed: Number(s.packetsObserved ?? 0n),
    flows_extracted: Number(s.flowsExtracted ?? 0n),
    pending_batches: s.pendingBatches ?? 0,
    queue_bytes: Number(s.queueBytes ?? 0n),
    last_heartbeat_at: s.lastHeartbeatAt,
    last_upload_at: s.lastUploadAt,
    recent_warning: s.recentWarning ?? null,
  };
};

function getTroubleshootingAdvice(sensor: ReturnType<typeof serialiseSensor>): string {
  if (sensor.status === "revoked") {
    return "Sensor access revoked. The agent cannot ingest flows. Create a new sensor key to resume monitoring.";
  }
  if (sensor.status === "pending") {
    return "Sensor key minted but no heartbeat or flows received yet. Start the agent: sudo -E python agent/agent.py --interface <iface>";
  }
  if (sensor.status === "offline") {
    return "No heartbeat received within 2 minutes. The sensor process may have exited, the host rebooted, or network connectivity is broken.";
  }
  if (sensor.status === "degraded") {
    if (sensor.capture_status === "permission_denied") {
      return "Packet capture permission denied. Scapy requires root or CAP_NET_RAW capability.";
    }
    if (sensor.pending_batches >= 10) {
      return `Telemetry upload queue backpressure (${sensor.pending_batches} batches pending). Check outbound HTTPS latency or proxy configuration.`;
    }
    if (sensor.recent_warning) {
      return `Operational warning: ${sensor.recent_warning}`;
    }
    return "Sensor communicating but experiencing subsystem issues.";
  }
  if (sensor.packets_observed === 0) {
    return "Sensor is online and capture engine is active. Zero packets observed so far (monitored network interface is quiet).";
  }
  return "Sensor is fully operational, actively observing packets, extracting flows, and uploading telemetry.";
}

/** The whole estate in one request. Three levels deep is a small payload — a
 *  large fleet is hundreds of sensors, not millions — and it saves the console
 *  a waterfall of calls to render one page. */
fleetRouter.get(
  "/",
  route(async (req, res) => {
    const offices = await prisma.office.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { name: "asc" },
      include: {
        networks: {
          orderBy: { name: "asc" },
          include: {
            sensors: {
              where: { revokedAt: null },
              orderBy: { name: "asc" },
            },
          },
        },
      },
    });
    res.json({
      offices: offices.map((o) => ({
        id: o.id,
        name: o.name,
        networks: o.networks.map((n) => ({
          id: n.id,
          name: n.name,
          cidr: n.cidr,
          sensors: n.sensors.map(serialiseSensor),
        })),
      })),
    });
  }),
);

/** Detailed inventory of sensors across the organization with status & pagination. */
fleetRouter.get(
  "/sensors",
  route(async (req, res) => {
    const organizationId = req.user!.organizationId;
    const query = req.query;
    const statusFilter = typeof query.status === "string" ? query.status : undefined;
    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : undefined;

    const rawSensors = await prisma.sensor.findMany({
      where: {
        network: { office: { organizationId } },
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        network: {
          include: {
            office: { select: { id: true, name: true } },
          },
        },
      },
    });

    const items = rawSensors
      .map((s) => {
        const base = serialiseSensor(s);
        return {
          ...base,
          network_name: s.network.name,
          network_cidr: s.network.cidr,
          office_name: s.network.office.name,
          office_id: s.network.office.id,
          troubleshooting: getTroubleshootingAdvice(base),
        };
      })
      .filter((s) => (statusFilter ? s.status === statusFilter : true));

    res.json({
      total: items.length,
      sensors: items,
    });
  }),
);

/** Single sensor detailed diagnostics & health. */
fleetRouter.get(
  "/sensors/:id",
  route(async (req, res) => {
    const sensor = await prisma.sensor.findFirst({
      where: {
        id: req.params.id,
        network: { office: { organizationId: req.user!.organizationId } },
      },
      include: {
        network: {
          include: {
            office: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!sensor) throw new HttpError(404, "No such sensor.");

    const base = serialiseSensor(sensor);
    res.json({
      ...base,
      network: { id: sensor.network.id, name: sensor.network.name, cidr: sensor.network.cidr },
      office: { id: sensor.network.office.id, name: sensor.network.office.name },
      troubleshooting: getTroubleshootingAdvice(base),
    });
  }),
);

/** Historical heartbeat observations for charts and audit logs. */
fleetRouter.get(
  "/sensors/:id/history",
  route(async (req, res) => {
    const sensor = await prisma.sensor.findFirst({
      where: {
        id: req.params.id,
        network: { office: { organizationId: req.user!.organizationId } },
      },
      select: { id: true },
    });
    if (!sensor) throw new HttpError(404, "No such sensor.");

    const heartbeats = await prisma.sensorHeartbeat.findMany({
      where: { sensorId: sensor.id },
      orderBy: { createdAt: "desc" },
      take: 60,
    });

    res.json({
      sensor_id: sensor.id,
      history: heartbeats.map((h) => ({
        id: h.id,
        at: h.createdAt.toISOString(),
        status: h.status,
        capture_status: h.captureStatus,
        packets_observed: Number(h.packetsObserved),
        flows_extracted: Number(h.flowsExtracted),
        pending_batches: h.pendingBatches,
        queue_bytes: Number(h.queueBytes),
        warning: h.warning,
      })),
    });
  }),
);

/** The register form says the organisation name is renameable in Settings, so
 *  it is. The slug is left alone on purpose: nothing is addressed by it yet,
 *  and changing an identifier to match a display name is how links break. */
fleetRouter.patch(
  "/org",
  route(async (req, res) => {
    const body = validate(z.object({ name }), req.body);
    const org = await prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: { name: body.name },
      select: { name: true },
    });
    res.json(org);
  }),
);

/** A unique violation on (org, name) or (office, name) is a duplicate the user
 *  can fix, not a 500. Prisma reports it as P2002. */
function conflict<T>(promise: Promise<T>, message: string): Promise<T> {
  return promise.catch((err: { code?: string }) => {
    if (err.code === "P2002") throw new HttpError(409, message);
    throw err;
  });
}

fleetRouter.post(
  "/offices",
  route(async (req, res) => {
    const body = validate(z.object({ name }), req.body);
    const office = await conflict(
      prisma.office.create({
        data: { organizationId: req.user!.organizationId, name: body.name },
      }),
      "An office with that name already exists.",
    );
    res.status(201).json({ id: office.id, name: office.name, networks: [] });
  }),
);

fleetRouter.post(
  "/offices/:id/networks",
  route(async (req, res) => {
    const body = validate(z.object({ name, cidr }), req.body);
    const office = await prisma.office.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      select: { id: true },
    });
    if (!office) throw new HttpError(404, "No such office.");

    const network = await conflict(
      prisma.network.create({ data: { officeId: office.id, name: body.name, cidr: body.cidr } }),
      "A network with that name already exists in this office.",
    );
    res.status(201).json({ id: network.id, name: network.name, cidr: network.cidr, sensors: [] });
  }),
);

/** Mints the key. This is the only response that ever contains it: only the
 *  hash is stored, so a lost key is replaced, not recovered. */
fleetRouter.post(
  "/networks/:id/sensors",
  route(async (req, res) => {
    const body = validate(z.object({ name }), req.body);
    const network = await prisma.network.findFirst({
      where: { id: req.params.id, office: { organizationId: req.user!.organizationId } },
      select: { id: true },
    });
    if (!network) throw new HttpError(404, "No such network.");

    const key = newSensorKey();
    const sensor = await conflict(
      prisma.sensor.create({
        data: { networkId: network.id, name: body.name, keyHash: key.hashed, status: "pending" },
      }),
      "A sensor with that name already exists on this network.",
    );
    res.status(201).json({ ...serialiseSensor(sensor), key: key.raw });
  }),
);

fleetRouter.delete(
  "/offices/:id",
  route(async (req, res) => {
    const { count } = await prisma.office.deleteMany({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    if (!count) throw new HttpError(404, "No such office.");
    res.status(204).end();
  }),
);

fleetRouter.delete(
  "/networks/:id",
  route(async (req, res) => {
    const { count } = await prisma.network.deleteMany({
      where: { id: req.params.id, office: { organizationId: req.user!.organizationId } },
    });
    if (!count) throw new HttpError(404, "No such network.");
    res.status(204).end();
  }),
);

/** Revoked, not deleted: the agent's next batch must fail closed, but the
 *  detections it already reported are evidence and stay. */
fleetRouter.delete(
  "/sensors/:id",
  route(async (req, res) => {
    const { count } = await prisma.sensor.updateMany({
      where: {
        id: req.params.id,
        revokedAt: null,
        network: { office: { organizationId: req.user!.organizationId } },
      },
      data: { revokedAt: new Date(), status: "revoked" },
    });
    if (!count) throw new HttpError(404, "No such sensor.");
    res.status(204).end();
  }),
);
