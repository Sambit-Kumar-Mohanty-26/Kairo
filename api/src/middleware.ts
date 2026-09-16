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

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ detail: "Something went wrong." });
}
