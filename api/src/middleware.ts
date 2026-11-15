import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodSchema } from "zod";
import { prisma } from "./db.js";
import { decodeAccessToken } from "./security.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Express 4 doesn't catch rejected promises — without this, a thrown error
 *  in an async handler hangs the request instead of returning a 500. */
export function route(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Parses the body or throws a 422 carrying the first message, matching the
 *  shape the frontend reads (`detail`). */
export function validate<T>(schema: ZodSchema<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) throw new HttpError(422, err.issues[0].message);
    throw err;
  }
}

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
};

/** Small-process guard for abuse-prone endpoints. A shared edge limiter should
 * still be used in a multi-instance deployment, but this protects local and
 * single-instance deployments by default. */
export function rateLimit({
  windowMs,
  max,
  message = "Too many requests. Try again later.",
}: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > max) {
      res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
      res.status(429).json({ detail: message });
      return;
    }
    next();
  };
}

type AuthedUser = NonNullable<Awaited<ReturnType<typeof findUser>>>;

function findUser(id: string) {
  return prisma.user.findUnique({ where: { id }, include: { organization: true } });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export const authGuard = route(async (req, _res, next) => {
  const unauthorized = new HttpError(401, "Not signed in.");
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) throw unauthorized;

  const claims = decodeAccessToken(token);
  if (!claims) throw unauthorized;

  const user = await findUser(claims.sub);
  if (!user || !user.isActive) throw unauthorized;

  req.user = user;
  next();
});

/** Role-Based Access Control (RBAC) guard.
 *  Validates that the authenticated user's role is in the permitted set.
 *  'owner' role possesses universal superuser administrative privileges. */
export function requireRole(...allowedRoles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new HttpError(401, "Not signed in.");
    }
    const userRole = (req.user.role || "viewer").toLowerCase();
    if (userRole === "owner" || allowedRoles.map((r) => r.toLowerCase()).includes(userRole)) {
      next();
      return;
    }
    throw new HttpError(403, `Access denied. Requires one of roles: [${allowedRoles.join(", ")}].`);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ detail: "Something went wrong." });
}
