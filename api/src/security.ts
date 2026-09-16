import argon2 from "argon2";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

/** Cost of one verify against a throwaway hash, so a missing account and a
 *  wrong password take the same time. Computed once at boot. */
const DUMMY_HASH = await argon2.hash("timing-equaliser-not-a-real-password");

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(password: string, hashed: string | null): Promise<boolean> {
  if (!hashed) {
    // Google-only account, or no account at all. Still do the work.
    await argon2.verify(DUMMY_HASH, password).catch(() => false);
    return false;
  }
  return argon2.verify(hashed, password).catch(() => false);
}

export interface AccessClaims {
  sub: string;
  org: string;
  role: string;
}

export function createAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.accessTokenMinutes * 60,
  });
}

export function decodeAccessToken(token: string): AccessClaims | null {
  try {
    // algorithms pinned: without it a token signed with alg:none would verify
    return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as AccessClaims;
  } catch {
    return null;
  }
}

export function tokenHash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Opaque refresh/reset token: the plaintext goes to the client, only the
 *  hash is stored, so a database leak doesn't hand over live sessions. */
export function newOpaqueToken(): { raw: string; hashed: string } {
  const raw = crypto.randomBytes(48).toString("base64url");
  return { raw, hashed: tokenHash(raw) };
}
