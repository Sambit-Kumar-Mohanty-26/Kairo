import crypto from "node:crypto";
import { prisma } from "./db.js";
import { HttpError, route } from "./middleware.js";
import { tokenHash } from "./security.js";

/* A sensor is not a user. It has no password, no session and no refresh — it
   has one long-lived key, scoped to itself, which the operator pastes into an
   agent's config once. Stored as a SHA-256 hash for the same reason refresh
   tokens are: a database leak must not hand over live ingest. */

/** A sensor counts as live if it has reported within this window. The agent
 *  flushes every 10s even when idle, so two minutes is six missed flushes —
 *  long enough to survive a deploy or a flaky link, short enough that "Live"
 *  in the console means live. Derived, never stored: a status column would
 *  need a cron job to tell the truth. */
export const LIVE_WITHIN_MS = 2 * 60_000;

export const isLive = (lastSeenAt: Date | null): boolean =>
  lastSeenAt !== null && Date.now() - lastSeenAt.getTime() < LIVE_WITHIN_MS;

/** `ksk_` so it is recognisable in a paste and greppable in a leak scan. */
export function newSensorKey(): { raw: string; hashed: string } {
  const raw = `ksk_${crypto.randomBytes(32).toString("base64url")}`;
  return { raw, hashed: tokenHash(raw) };
}

type AuthedSensor = NonNullable<Awaited<ReturnType<typeof findSensor>>>;

function findSensor(keyHash: string) {
  return prisma.sensor.findUnique({
    where: { keyHash },
    // The org id, for the denormalised column on every detection this sensor
    // produces. Walking up on each batch is the join we are avoiding.
    include: { network: { include: { office: { select: { organizationId: true } } } } },
  });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sensor?: AuthedSensor;
    }
  }
}

/** Authenticates the agent, not a person. One indexed lookup on the hash — no
 *  argon2 here: the key is 32 random bytes, so there is nothing to brute-force
 *  and the endpoint is called every ten seconds by every sensor in the fleet. */
export const sensorGuard = route(async (req, _res, next) => {
  const unauthorized = new HttpError(401, "Unknown or revoked sensor key.");
  const [scheme, key] = (req.headers.authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !key) throw unauthorized;

  const sensor = await findSensor(tokenHash(key));
  if (!sensor || sensor.revokedAt) throw unauthorized;

  req.sensor = sensor;
  next();
});
