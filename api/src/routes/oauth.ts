import crypto from "node:crypto";
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { config, googleEnabled } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, route, validate } from "../middleware.js";
import { uniqueSlug } from "../org.js";
import { createAccessToken, newOpaqueToken } from "../security.js";

export const oauthRouter = Router();

async function createAuthSession(user: { id: string; organizationId: string; role: string }) {
  const { raw, hashed } = newOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashed,
      expiresAt: new Date(Date.now() + config.refreshTokenDays * 86_400_000),
    },
  });

  return {
    access_token: createAccessToken({
      sub: user.id,
      org: user.organizationId,
      role: user.role,
    }),
    refresh_token: raw,
  };
}

async function findOrCreateGoogleUser(payload: { email: string; name?: string | null; sub: string }) {
  const address = payload.email.toLowerCase();
  let user = await prisma.user.findUnique({
    where: { email: address },
    include: { organization: true },
  });

  if (user) {
    if (!user.googleSub) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleSub: payload.sub, emailVerified: true },
        include: { organization: true },
      });
    }
  } else {
    const domainPart = address.split("@")[1] ?? "org";
    const orgName = domainPart.split(".")[0]?.slice(0, 120) || "Default Org";
    const slug = await uniqueSlug(orgName);
    user = await prisma.user.create({
      data: {
        email: address,
        fullName: payload.name ?? null,
        googleSub: payload.sub,
        emailVerified: true,
        role: "owner",
        organization: { create: { name: orgName, slug } },
      },
      include: { organization: true },
    });
  }

  if (!user.isActive) throw new HttpError(403, "This account is disabled.");
  return user;
}

/**
 * GET /auth/google
 * Nexum-style direct browser redirect to Google OAuth consent screen.
 */
oauthRouter.get("/google", (req, res) => {
  if (googleEnabled) {
    const state = crypto.randomUUID();
    res.cookie("kairo_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60 * 1000,
    });
    const redirectUri = config.oauthRedirectUrl;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      config.googleClientId,
    )}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_type=code&scope=openid%20email%20profile&state=${state}&access_type=offline&prompt=select_account`;
    res.redirect(url);
  } else {
    res.redirect(`${config.frontendUrl}/api/auth/google/callback?simulated=true`);
  }
});

/**
 * GET /auth/google/callback
 * Direct browser callback from Google OAuth consent screen if Google Console
 * is configured to point directly to the API server.
 */
oauthRouter.get(
  "/google/callback",
  route(async (req, res) => {
    const { code, error } = req.query as { code?: string; state?: string; error?: string };
    const frontendOrigin = config.frontendUrl;

    if (error) {
      res.redirect(`${frontendOrigin}/login?error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (!code) {
      res.redirect(`${frontendOrigin}/login?error=missing_authorization_code`);
      return;
    }

    if (!googleEnabled) {
      res.redirect(`${frontendOrigin}/login?error=google_not_configured`);
      return;
    }

    const requestUri = `${req.protocol}://${req.get("host")}/auth/google/callback`;
    let tokens: any = null;

    const candidates = [config.oauthRedirectUrl, requestUri, `http://localhost:8000/auth/google/callback`];
    for (const uri of Array.from(new Set(candidates))) {
      try {
        const client = new OAuth2Client(config.googleClientId, config.googleClientSecret, uri);
        const result = await client.getToken(code);
        tokens = result.tokens;
        if (tokens?.id_token) break;
      } catch {
        // try next redirect URI
      }
    }

    if (!tokens?.id_token) {
      res.redirect(`${frontendOrigin}/auth/callback#error=${encodeURIComponent("Google sign-in didn't complete. Try again.")}`);
      return;
    }

    const client = new OAuth2Client(config.googleClientId, config.googleClientSecret);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      res.redirect(`${frontendOrigin}/auth/callback#error=${encodeURIComponent("That Google account has no verified email.")}`);
      return;
    }

    const user = await findOrCreateGoogleUser({
      email: payload.email,
      name: payload.name,
      sub: payload.sub,
    });

    const session = await createAuthSession(user);
    res.redirect(
      `${frontendOrigin}/auth/callback#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`
    );
  }),
);

const exchangeBody = z.object({
  code: z.string().optional(),
  simulated: z.boolean().optional(),
});

/**
 * POST /auth/google/exchange
 * Server-to-server or client exchange with support for simulation and multiple redirect URI fallbacks.
 */
oauthRouter.post(
  "/google/exchange",
  route(async (req, res) => {
    const { code, simulated } = validate(exchangeBody, req.body);

    if (simulated) {
      if (process.env.NODE_ENV === "production") {
        throw new HttpError(403, "Simulation is not permitted in production.");
      }
      const simEmail = "operator.demo@kairo.internal";
      const user = await findOrCreateGoogleUser({
        email: simEmail,
        name: "Kairo Demo Operator",
        sub: "google_oauth_sub_demo_kairo",
      });
      const session = await createAuthSession(user);
      res.json(session);
      return;
    }

    if (!googleEnabled) throw new HttpError(503, "Google sign-in isn't configured.");
    if (!code) throw new HttpError(400, "Missing authorization code.");

    let tokens: any = null;
    const candidates = [
      config.oauthRedirectUrl,
      `${config.frontendUrl}/api/auth/google/callback`,
      "http://localhost:3000/api/auth/google/callback",
      "http://localhost:8000/auth/google/callback",
    ];

    for (const uri of Array.from(new Set(candidates))) {
      try {
        const oauth = new OAuth2Client(config.googleClientId, config.googleClientSecret, uri);
        const result = await oauth.getToken(code);
        tokens = result.tokens;
        if (tokens?.id_token) break;
      } catch {
        // Continue to test other redirect URIs if one mismatches
      }
    }

    if (!tokens?.id_token) {
      throw new HttpError(400, "Google sign-in didn't complete. Try again.");
    }

    const oauth = new OAuth2Client(config.googleClientId, config.googleClientSecret);
    const payload = (
      await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId })
    ).getPayload();

    if (!payload?.email || !payload.email_verified) {
      throw new HttpError(400, "That Google account has no verified email.");
    }

    const user = await findOrCreateGoogleUser({
      email: payload.email,
      name: payload.name,
      sub: payload.sub,
    });

    const session = await createAuthSession(user);
    res.json(session);
  }),
);
