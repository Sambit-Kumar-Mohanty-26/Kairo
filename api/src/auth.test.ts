/**
 * End-to-end auth check. Needs a Postgres in DATABASE_URL — point it at a
 * scratch Neon branch, never a database with real rows: it truncates.
 *
 *   npm test
 *
 * Fails loudly if any step of register -> login -> me -> refresh -> reset ->
 * logout breaks.
 */
import assert from "node:assert/strict";
import { config } from "./config.js";
import { prisma } from "./db.js";

const BASE = `http://127.0.0.1:${config.port}`;
const EMAIL = `ana${Date.now()}@acme.io`;
const PW = "correct-horse-battery";
const NEW_PW = "brand-new-passphrase";

type Json = Record<string, any>;

async function call(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: Json }> {
  const { token, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const post = (path: string, data: unknown, token?: string) =>
  call(path, { method: "POST", body: JSON.stringify(data), token });

async function main() {
  assert.equal((await call("/health")).body.status, "ok");

  // register
  let r = await post("/auth/register", { email: EMAIL, password: PW, full_name: "Ana Ruiz" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.email, EMAIL);
  assert.equal(r.body.user.organization.slug.startsWith("acme"), true);
  assert.equal("password_hash" in r.body.user, false, "password hash must never serialise");

  assert.equal((await post("/auth/register", { email: EMAIL, password: PW })).status, 409);
  assert.equal(
    (await post("/auth/register", { email: "b@x.io", password: "short" })).status,
    422,
  );

  // login
  r = await post("/auth/login", { email: EMAIL, password: PW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const tok = r.body;
  assert.equal((await post("/auth/login", { email: EMAIL, password: "wrong-one" })).status, 401);
  assert.equal(
    (await post("/auth/login", { email: "ghost@nowhere.io", password: "whatever" })).status,
    401,
  );

  // me
  assert.equal((await call("/auth/me", { token: tok.access_token })).body.email, EMAIL);
  assert.equal((await call("/auth/me")).status, 401);
  assert.equal((await call("/auth/me", { token: "garbage" })).status, 401);

  // refresh rotates, and the presented token dies
  r = await post("/auth/refresh", { refresh_token: tok.refresh_token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const fresh = r.body;
  assert.notEqual(fresh.refresh_token, tok.refresh_token);
  assert.equal((await post("/auth/refresh", { refresh_token: tok.refresh_token })).status, 401);

  // forgot-password says the same thing either way
  for (const email of [EMAIL, "ghost@nowhere.io"]) {
    assert.equal((await post("/auth/forgot-password", { email })).status, 202);
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  assert.equal(await prisma.passwordResetToken.count({ where: { userId: user.id } }), 1);

  // reset: the raw token only exists in the email, so mint one the same way
  const { raw, hashed } = await import("./security.js").then((m) => m.newOpaqueToken());
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashed, expiresAt: new Date(Date.now() + 3_600_000) },
  });

  assert.equal(
    (await post("/auth/reset-password", { token: "bogus", password: "long-enough-pw" })).status,
    400,
  );
  r = await post("/auth/reset-password", { token: raw, password: NEW_PW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // single use
  assert.equal(
    (await post("/auth/reset-password", { token: raw, password: "third-attempt-pw" })).status,
    400,
  );
  // old password dead, new one lives, pre-reset session revoked
  assert.equal((await post("/auth/login", { email: EMAIL, password: PW })).status, 401);
  assert.equal((await post("/auth/login", { email: EMAIL, password: NEW_PW })).status, 200);
  assert.equal((await post("/auth/refresh", { refresh_token: fresh.refresh_token })).status, 401);

  // logout
  const final = r.body;
  assert.equal((await post("/auth/logout", { refresh_token: final.refresh_token })).status, 204);
  assert.equal(
    (await post("/auth/refresh", { refresh_token: final.refresh_token })).status,
    401,
  );

  await prisma.organization.deleteMany({ where: { id: user.organizationId } });
  console.log("auth flow OK");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
