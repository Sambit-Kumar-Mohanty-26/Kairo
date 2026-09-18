import { NextResponse } from "next/server";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Starts Google sign-in from *this* origin rather than the API.
 *
 * The authorisation URL is nothing but a querystring wrapped around a public
 * client_id — no secret is involved until the code exchange, which still
 * happens on the API because that is where GOOGLE_CLIENT_SECRET lives. So
 * there was never a reason to send the browser to Render just to be redirected
 * to Google: on a cold start that meant Render's "service waking up" page, on
 * our own domain, in the middle of signing up.
 *
 * The state cookie is set here and verified by the API's /auth/google/callback.
 * Both are on this origin — the callback reaches the API through the rewrite in
 * next.config.ts — so the browser hands it back and Express can check it.
 */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const { origin, protocol } = new URL(req.url);

  if (!clientId) {
    // Reuse the callback page's error state rather than inventing a second one.
    const msg = encodeURIComponent("Google sign-in isn't configured.");
    return NextResponse.redirect(`${origin}/auth/callback#error=${msg}`);
  }

  /* Wake the API now, not when Google sends the browser back. Render's free
     tier sleeps after 15 minutes and takes ~30s to start, and the callback is
     useless until it is up — this buys the seconds the user spends picking an
     account. Fire and forget: if it fails the callback fails on its own terms.
     ponytail: still a race if the user consents faster than Render boots. The
     real fix is a plan that doesn't sleep. */
  void fetch(`${API}/health`, { cache: "no-store" }).catch(() => {});

  const state = crypto.randomUUID();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    // Must match the API's config.oauthRedirectUrl and the Google console
    // entry byte for byte. All three are <this origin>/api/auth/google/callback.
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set("kairo_oauth_state", state, {
    httpOnly: true,
    secure: protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
