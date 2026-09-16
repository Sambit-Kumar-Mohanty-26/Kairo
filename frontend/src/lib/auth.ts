"use client";

/**
 * Talks to the FastAPI backend (Render) from the browser.
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

/** FastAPI puts a string in `detail` for HTTPException and a list for 422. */
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

export function register(email: string, password: string) {
  return request<TokenPair>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
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

export function googleUrl() {
  return `${API}/auth/google/start`;
}

/** Refreshes once on 401, since the access token only lasts 30 minutes. */
export async function me(): Promise<User> {
  const token = getAccessToken();
  if (!token) throw new ApiError(401, "Not signed in.");
  try {
    return await request<User>("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
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
    return pair.user;
  }
}

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
