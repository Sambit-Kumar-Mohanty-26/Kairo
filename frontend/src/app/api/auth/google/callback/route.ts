import { NextResponse } from "next/server";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STATE_COOKIE = "kairo_oauth_state";

/**
 * Handles callback from Google OAuth.
 * Nexum architecture: Directly exchanges code server-to-server via Express API,
 * eliminating client-side polling, sleep delays, and "waking up" screens.
 */
export async function GET(req: Request) {
  const { origin, searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const simulated = searchParams.get("simulated");
  const error = searchParams.get("error");
  const expected = req.headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|; )${STATE_COOKIE}=([^;]*)`))?.[1];

  const toError = (msg: string) => {
    const res = NextResponse.redirect(`${origin}/auth/callback#error=${encodeURIComponent(msg)}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  if (error) {
    return toError("Google sign-in was canceled.");
  }

  if (simulated !== "true") {
    if (!code) {
      return toError("Missing Google authorization code.");
    }
    if (state && expected && state !== expected) {
      return toError("OAuth state verification failed. Please try again.");
    }
  }

  try {
    const backendRes = await fetch(`${API}/auth/google/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code || undefined,
        simulated: simulated === "true",
      }),
      cache: "no-store",
    });

    if (!backendRes.ok) {
      const errJson = await backendRes.json().catch(() => ({}));
      const msg = errJson?.detail || "Google sign-in exchange failed. Try again.";
      return toError(msg);
    }

    const tokens = (await backendRes.json()) as { access_token: string; refresh_token: string };

    const res = NextResponse.redirect(
      `${origin}/auth/callback#access_token=${encodeURIComponent(tokens.access_token)}&refresh_token=${encodeURIComponent(tokens.refresh_token)}`,
    );
    res.cookies.delete(STATE_COOKIE);
    res.cookies.set("kairo.access", tokens.access_token, { path: "/", httpOnly: false, sameSite: "lax" });
    res.cookies.set("kairo.refresh", tokens.refresh_token, { path: "/", httpOnly: false, sameSite: "lax" });
    return res;
  } catch (err) {
    return toError("Could not connect to authentication service.");
  }
}
