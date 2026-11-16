import { Router, type Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { sendPasswordReset } from "../email.js";
import { HttpError, authGuard, rateLimit, route, validate } from "../middleware.js";
import {
  createAccessToken,
  hashPassword,
  newOpaqueToken,
  tokenHash,
  verifyPassword,
} from "../security.js";
import { uniqueSlug } from "../org.js";
import { type UserWithOrg, serialiseUser } from "../serialise.js";

export const authRouter = Router();

const REFRESH_COOKIE = "kairo_refresh_token";

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth",
    maxAge: config.refreshTokenDays * 86_400_000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth",
  });
}

const password = z.string().min(8, "Password must be at least 8 characters.").max(128);
const email = z.string().email("Enter a valid email address.");

const registerIn = z.object({
  email,
  password,
  full_name: z.string().max(120).optional(),
  organization_name: z.string().max(120).optional(),
});
const loginIn = z.object({ email, password: z.string() });
const refreshIn = z.object({ refresh_token: z.string().optional() });
const forgotIn = z.object({ email });
const resetIn = z.object({ token: z.string(), password });

async function issueTokens(user: UserWithOrg) {
  const { raw, hashed } = newOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashed,
      expiresAt: new Date(Date.now() + config.refreshTokenDays * 86_400_000),
    },
  });

  return {
    access_token: createAccessToken({ sub: user.id, org: user.organizationId, role: user.role }),
    refresh_token: raw,
    token_type: "bearer",
    expires_in: config.accessTokenMinutes * 60,
    user: serialiseUser(user),
  };
}

authRouter.post(
  "/register",
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  route(async (req, res) => {
    const body = validate(registerIn, req.body);
    const address = body.email.toLowerCase().trim();

    if (await prisma.user.findUnique({ where: { email: address }, select: { id: true } })) {
      // Deliberately explicit. Hiding this buys no real privacy — the attacker
      // learns the same by trying to register — and it makes a legitimate
      // "you already have an account" impossible to explain.
      throw new HttpError(409, "An account with this email already exists.");
    }

    // The register form asks for this, and Google sign-in cannot. The domain
    // fallback is for that path: ana@acme.io -> "acme", renameable in
    // Settings. Better a name the owner recognises than an empty workspace.
    const orgName = (body.organization_name ?? address.split("@")[1].split(".")[0])
      .trim()
      .slice(0, 120);

    const user = await prisma.user.create({
      data: {
        email: address,
        fullName: body.full_name ?? null,
        passwordHash: await hashPassword(body.password),
        role: "owner",
        organization: { create: { name: orgName, slug: await uniqueSlug(orgName) } },
      },
      include: { organization: true },
    });

    const tokens = await issueTokens(user);
    setRefreshCookie(res, tokens.refresh_token);
    res.status(201).json(tokens);
  }),
);

authRouter.post(
  "/login",
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  route(async (req, res) => {
    const body = validate(loginIn, req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
      include: { organization: true },
    });

    // verifyPassword hashes a dummy when passwordHash is null, so a missing
    // account and a wrong password take the same time and say the same thing.
    if (!(await verifyPassword(body.password, user?.passwordHash ?? null))) {
      throw new HttpError(401, "Incorrect email or password.");
    }
    if (!user!.isActive) throw new HttpError(403, "This account is disabled.");

    const tokens = await issueTokens(user!);
    setRefreshCookie(res, tokens.refresh_token);
    res.json(tokens);
  }),
);

authRouter.post(
  "/refresh",
  route(async (req, res) => {
    const body = validate(refreshIn, req.body);
    const token = body.refresh_token || req.cookies?.[REFRESH_COOKIE];
    if (!token || typeof token !== "string") {
      throw new HttpError(400, "Missing refresh token in request body or HttpOnly cookie.");
    }

    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: { include: { organization: true } } },
    });

    const now = new Date();
    if (!row || row.revokedAt || row.expiresAt <= now || !row.user.isActive) {
      clearRefreshCookie(res);
      throw new HttpError(401, "Your session has expired. Sign in again.");
    }

    // Rotate: the presented token dies as the new one is born, so a stolen
    // token is good for one use at most and the theft shows up as a failure.
    await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: now } });
    const tokens = await issueTokens(row.user);
    setRefreshCookie(res, tokens.refresh_token);
    res.json(tokens);
  }),
);

authRouter.post(
  "/logout",
  route(async (req, res) => {
    const body = validate(refreshIn, req.body);
    const token = body.refresh_token || req.cookies?.[REFRESH_COOKIE];
    if (token && typeof token === "string") {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: tokenHash(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(res);
    // 204 whether or not it matched — nothing useful to report either way
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  authGuard,
  route(async (req, res) => {
    res.json(serialiseUser(req.user!));
  }),
);

authRouter.post(
  "/forgot-password",
  rateLimit({ windowMs: 15 * 60_000, max: 5 }),
  route(async (req, res) => {
    const body = validate(forgotIn, req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });

    if (user) {
      const { raw, hashed } = newOpaqueToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashed,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      await sendPasswordReset(user.email, `${config.frontendUrl}/reset-password?token=${raw}`);
    }

    // Always 202, account or not. Unlike register, no legitimate sender needs
    // to know, so this one stays silent.
    res
      .status(202)
      .json({ detail: "If that address has an account, a reset link is on its way." });
  }),
);

authRouter.post(
  "/reset-password",
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  route(async (req, res) => {
    const body = validate(resetIn, req.body);
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: tokenHash(body.token) },
      include: { user: { include: { organization: true } } },
    });

    const now = new Date();
    if (!row || row.usedAt || row.expiresAt <= now) {
      throw new HttpError(400, "This reset link is invalid or has expired.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(body.password) },
      }),
      prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: now } }),
      // Whoever changed the password gets a fresh session; every other device
      // is signed out. That's the point of a reset.
      prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    const tokens = await issueTokens(row.user);
    setRefreshCookie(res, tokens.refresh_token);
    res.json(tokens);
  }),
);
