// Node's own .env loader (20.6+), so no dotenv dependency. On Render the
// variables come from the dashboard and there is no file to load.
try {
  process.loadEnvFile();
} catch {
  /* no .env — fine */
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set. Copy .env.example to .env and fill it in.`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),

  // short, because it can't be revoked once issued — revocation happens on refresh
  accessTokenMinutes: 30,
  // long, but it lives in the DB so logout and password change can kill it
  refreshTokenDays: 30,

  // exact origins, never "*" — a wildcard is rejected the moment credentials
  // are sent, and we want that constraint enforced anyway
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),

  frontendUrl: (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, ""),

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",

  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Kairo <onboarding@resend.dev>",
};

export const googleEnabled = Boolean(config.googleClientId && config.googleClientSecret);
