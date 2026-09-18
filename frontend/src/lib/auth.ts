"use client";

/**
 * Talks to the Express API (Render) from the browser.
 *
 * Bearer tokens, not cookies: the frontend lives on one registrable domain
 * (vercel.app) and the API on another (onrender.com), so a session cookie
 * would be third-party and silently dropped by any browser blocking those.
 * Move to httpOnly cookies if both ever sit under one custom parent domain.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ACCESS = "kairo.access";
const REFRESH = "kairo.refresh";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  email_verified: boolean;
  organization: Organization;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The API puts a string in `detail`. The array branch is FastAPI's 422
 *  shape, kept because the OAuth callback is the one route that can still
 *  answer in it. */
function readDetail(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return detail[0].msg;
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    // network failure, CORS rejection, or a Render instance still cold-starting
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, readDetail(body, "Something went wrong."));
  return body as T;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS);
}

export function storeSession(t: Pick<TokenPair, "access_token" | "refresh_token">) {
  localStorage.setItem(ACCESS, t.access_token);
  localStorage.setItem(REFRESH, t.refresh_token);
}

function clearSession() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

export function register(email: string, password: string, organization: string) {
  return request<TokenPair>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, organization_name: organization }),
  }).then((t) => (storeSession(t), t));
}

export function login(email: string, password: string) {
  return request<TokenPair>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }).then((t) => (storeSession(t), t));
}

export function forgotPassword(email: string) {
  return request<void>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string) {
  return request<TokenPair>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  }).then((t) => (storeSession(t), t));
}

/** A route handler in this app, not a proxy to the API: building Google's
 *  authorisation URL needs only a public client_id, so there is no reason for
 *  the browser to touch the backend before it reaches Google. */
export function googleUrl() {
  return "/api/auth/google/start";
}

/** How long to keep trying to reach the API before giving up. Render's free
 *  tier sleeps after 15 minutes and takes roughly half a minute to come back;
 *  this leaves room for a slow one. */
const WAKE_BUDGET_MS = 75_000;

/** Trades Google's one-time code for a session.
 *
 *  Retries while the API is unreachable, which no other call bothers to do.
 *  The difference is that the code is single use: if this fails the user has
 *  to start sign-in over, so waiting out a cold start is better than an error.
 *  Anything the server actually answers — a stale code, a disabled account —
 *  is final and throws on the first attempt. */
export async function googleExchange(code: string): Promise<void> {
  const deadline = Date.now() + WAKE_BUDGET_MS;
  for (;;) {
    try {
      const t = await request<Pick<TokenPair, "access_token" | "refresh_token">>(
        "/auth/google/exchange",
        { method: "POST", body: JSON.stringify({ code }) },
      );
      // A waking instance can answer with its host's holding page, which is a
      // 200 carrying HTML. request() turns that into null rather than a throw.
      if (!t?.access_token) throw new ApiError(0, "The server is still starting up.");
      storeSession(t);
      return;
    } catch (e) {
      const status = e instanceof ApiError ? e.status : -1;
      const waking = status === 0 || status >= 502;
      if (!waking || Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

/** Runs an authenticated request, refreshing once on 401 — the access token
 *  only lasts 30 minutes and the console polls for longer than that. Every
 *  signed-in call goes through here, so the retry is written once. */
export async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new ApiError(401, "Not signed in.");

  const call = (t: string) =>
    request<T>(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } });

  try {
    return await call(token);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    const refresh = localStorage.getItem(REFRESH);
    if (!refresh) throw e;
    const pair = await request<TokenPair>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => {
      clearSession();
      throw e;
    });
    storeSession(pair);
    return call(pair.access_token);
  }
}

export const me = () => authed<User>("/auth/me");

export async function logout() {
  const refresh = localStorage.getItem(REFRESH);
  clearSession();
  if (refresh) {
    await request<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => {}); // the local session is already gone; server-side is best effort
  }
}
