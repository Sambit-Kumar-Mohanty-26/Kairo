import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config, googleEnabled } from "./config.js";
import { errorHandler } from "./middleware.js";
import { authRouter } from "./routes/auth.js";
import { oauthRouter } from "./routes/oauth.js";

const app = express();

// Render terminates TLS at its proxy and forwards X-Forwarded-Proto. Without
// this, req.protocol reads "http" behind it — which would build an http://
// OAuth redirect_uri that Google rejects, and drop Secure off the state cookie.
app.set("trust proxy", 1);

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    // Explicit origins, never "*" — a wildcard is rejected as soon as
    // credentials are sent, and we want that constraint enforced anyway.
    origin: config.corsOrigins,
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", google: googleEnabled });
});

app.use("/auth", authRouter);
app.use("/auth", oauthRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Kairo API on :${config.port}`);
});
