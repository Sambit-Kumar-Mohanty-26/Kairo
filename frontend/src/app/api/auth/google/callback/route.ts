import { NextResponse } from "next/server";

const STATE_COOKIE = "kairo_oauth_state";

/**
 * Where Google sends the browser back.
 *
 * Served by this app, not proxied to the API, and that is the whole point: a
 * full-page navigation displays whatever host answers it, so pointing this at
 * a sleeping Render instance put Render's "service waking up" page on screen
 * immediately after the user consented. Nothing here needs the backend — the
 * state check is against our own cookie — so it answers instantly and the slow
 * part becomes a fetch from /auth/callback, behind our own copy.
 *
 * The code travels on in the URL *fragment*, which is never sent to a server,
 * so it stays out of access logs and Referer headers. It is single use and
 * worthless without the client secret, which never leaves the API.
 */
export async function GET(req: Request) {
  const { origin, searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expected = req.headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|; )${STATE_COOKIE}=([^;]*)`))?.[1];

  const to = (params: Record<string, string>) => {
    const res = NextResponse.redirect(`${origin}/auth/callback#${new URLSearchParams(params)}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  // searchParams.get("error") covers the user clicking "Cancel" on Google's
  // consent screen, which is a normal outcome rather than a failure.
  if (searchParams.get("error") || !code || !state || state !== expected) {
    return to({ error: "Google sign-in didn't complete. Try again." });
  }
  return to({ code });
}
