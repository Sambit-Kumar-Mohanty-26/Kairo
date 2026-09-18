import crypto from "node:crypto";
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { config, googleEnabled } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, route } from "../middleware.js";
import { uniqueSlug } from "../org.js";
import { createAccessToken, newOpaqueToken } from "../security.js";

export const oauthRouter = Router();

const STATE_COOKIE = "kairo_oauth_state";

function client() {
  return new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    config.oauthRedirectUrl,
  );
}

oauthRouter.get(
  "/google/start",
  route(async (req, res) => {
    if (!googleEnabled) throw new HttpError(503, "Google sign-in isn't configured.");

    const state = crypto.randomBytes(16).toString("hex");
    // Reaches the browser through the frontend's rewrite, so it is scoped to
    // that origin and is genuinely first-party — it survives the round trip to
    // Google whatever a browser thinks of third-party cookies. SameSite=lax is
    // the loosest that still blocks CSRF here.
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: req.protocol === "https",
      sameSite: "lax",
      maxAge: 600_000,
    });

    res.redirect(
      client().generateAuthUrl({ scope: ["openid", "email", "profile"], state }),
    );
  }),
);

/** Sends the browser back to the frontend with the outcome in the URL
 *  *fragment* — a fragment is never sent to a server, so tokens stay out of
 *  access logs and Referer headers. */
function bounce(res: import("express").Response, params: Record<string, string>) {
  res.redirect(`${config.frontendUrl}/auth/callback#${new URLSearchParams(params)}`);
}

oauthRouter.get(
  "/google/callback",
  route(async (req, res) => {
    if (!googleEnabled) throw new HttpError(503, "Google sign-in isn't configured.");

    const { code, state } = req.query as { code?: string; state?: string };
    const expected = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);

    if (!code || !state || !expected || state !== expected) {
      return bounce(res, { error: "Google sign-in didn't complete. Try again." });
    }

    const oauth = client();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token) return bounce(res, { error: "Google didn't return an identity." });

    // Verifies the RS256 signature against Google's JWKS, plus issuer and
    // audience. Decoding without this would accept anything.
    const payload = (
      await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId })
    ).getPayload();

    if (!payload?.email || !payload.email_verified) {
      return bounce(res, { error: "That Google account has no verified email." });
    }

    const address = payload.email.toLowerCase();
    let user = await prisma.user.findUnique({
      where: { email: address },
      include: { organization: true },
    });

    if (user) {
      // Link rather than duplicate: someone who registered with a password and
      // later clicks "Continue with Google" is the same person.
      if (!user.googleSub) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleSub: payload.sub, emailVerified: true },
          include: { organization: true },
        });
      }
    } else {
      const orgName = address.split("@")[1].split(".")[0].slice(0, 120);
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

    if (!user.isActive) return bounce(res, { error: "This account is disabled." });

    const { raw, hashed } = newOpaqueToken();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashed,
        expiresAt: new Date(Date.now() + config.refreshTokenDays * 86_400_000),
      },
    });

    bounce(res, {
      access_token: createAccessToken({
        sub: user.id,
        org: user.organizationId,
        role: user.role,
      }),
      refresh_token: raw,
    });
  }),
);

