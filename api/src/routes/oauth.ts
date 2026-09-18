import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { config, googleEnabled } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, route, validate } from "../middleware.js";
import { uniqueSlug } from "../org.js";
import { createAccessToken, newOpaqueToken } from "../security.js";

export const oauthRouter = Router();

/* The browser never navigates here any more. The frontend owns both visible
   legs of Google sign-in — it builds the authorisation URL and it receives the
   redirect — and then calls this over fetch to trade the code for a session.

   That is what keeps Render off screen: a full-page navigation shows whatever
   host serves it, so on a cold start the user got Render's "waking up" page.
   A fetch shows nothing, so the frontend can sit on its own "Signing you in"
   screen and retry until the service is up.

   No state check here: the frontend verified it against its own first-party
   cookie before handing us the code. Nothing is lost by that — state exists to
   stop an attacker pinning their identity onto a victim's *session*, and this
   route returns tokens in its response body rather than setting anything on
   the caller, so replaying someone else's code only logs you in as them. */

const exchangeBody = z.object({ code: z.string().min(1, "Missing authorization code.") });

oauthRouter.post(
  "/google/exchange",
  route(async (req, res) => {
    if (!googleEnabled) throw new HttpError(503, "Google sign-in isn't configured.");

    const { code } = validate(exchangeBody, req.body);

    const oauth = new OAuth2Client(
      config.googleClientId,
      config.googleClientSecret,
      // Google checks this matches the one used to get the code. The frontend
      // sends the browser to <its origin>/api/auth/google/callback, so this
      // must resolve to exactly that — see config.oauthRedirectUrl.
      config.oauthRedirectUrl,
    );

    const { tokens } = await oauth.getToken(code).catch(() => {
      // Codes are single use and expire in minutes; a reload of the callback
      // page is the usual way to get here.
      throw new HttpError(400, "Google sign-in didn't complete. Try again.");
    });
    if (!tokens.id_token) throw new HttpError(400, "Google didn't return an identity.");

    // Verifies the RS256 signature against Google's JWKS, plus issuer and
    // audience. Decoding without this would accept anything.
    const payload = (
      await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId })
    ).getPayload();

    if (!payload?.email || !payload.email_verified) {
      throw new HttpError(400, "That Google account has no verified email.");
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

    if (!user.isActive) throw new HttpError(403, "This account is disabled.");

    const { raw, hashed } = newOpaqueToken();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashed,
        expiresAt: new Date(Date.now() + config.refreshTokenDays * 86_400_000),
      },
    });

    res.json({
      access_token: createAccessToken({
        sub: user.id,
        org: user.organizationId,
        role: user.role,
      }),
      refresh_token: raw,
    });
  }),
);
