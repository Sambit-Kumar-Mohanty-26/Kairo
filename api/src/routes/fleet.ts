import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, authGuard, route, validate } from "../middleware.js";
import { isLive, newSensorKey } from "../sensor.js";

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

const serialiseSensor = (s: { id: string; name: string; lastSeenAt: Date | null }) => ({
  id: s.id,
  name: s.name,
  last_seen_at: s.lastSeenAt,
  live: isLive(s.lastSeenAt),
});

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
              select: { id: true, name: true, lastSeenAt: true },
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
    // findFirst with the org in the where, not findUnique then compare: an id
    // belonging to another tenant is indistinguishable from one that does not
    // exist, which is what it should be.
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
        data: { networkId: network.id, name: body.name, keyHash: key.hashed },
      }),
      "A sensor with that name already exists on this network.",
    );
    res.status(201).json({ ...serialiseSensor(sensor), key: key.raw });
  }),
);

/** Cascade does the rest: deleting an office takes its networks, their sensors
 *  and those sensors' detections. That is the intent — a closed office should
 *  not leave orphaned alerts nobody owns. deleteMany, because its `where`
 *  carries the tenant scope; delete() would need the check as a separate read. */
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
      data: { revokedAt: new Date() },
    });
    if (!count) throw new HttpError(404, "No such sensor.");
    res.status(204).end();
  }),
);
