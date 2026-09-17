import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError, route, validate } from "../middleware.js";

/* The browser never talks to the Python service. It talks to this, which holds
   the only ML_URL there is — so the model can be moved, scaled or replaced
   without a frontend deploy, and it is not reachable from the internet at all.

   NOT guarded yet, deliberately, because /dashboard is not guarded yet either
   and Test Mode has to work from it. That is one decision, not two: the day
   authGuard goes back on the console, it goes on these two routes. Until then
   this is an unauthenticated CPU-spending endpoint on a 226 MB process, which
   is why MAX_FLOWS is small and the timeout is short. */
export const mlRouter = Router();

/** The service caps at 500. A lower cap here keeps one caller from holding the
 *  single uvicorn worker for a second while every other request queues. */
const MAX_FLOWS = 100;

/** Flow rows are ~70 numeric columns whose names come from the model, not from
 *  us — validating the keys here would mean duplicating the feature list and
 *  letting it drift. The service already rejects a flow missing a feature with
 *  a 422, so this only checks the shape we actually depend on. */
const predictBody = z.object({
  flows: z
    .array(z.record(z.number()))
    .min(1, "Send at least one flow.")
    .max(MAX_FLOWS, `Send at most ${MAX_FLOWS} flows per request.`),
});

/** Cold start is ~50s of wake plus a 4s unpickle, so /model and /health get
 *  room to answer it; /predict does not, because a warm predict is ~5ms and a
 *  slow one means the instance is in trouble. */
const TIMEOUT_MS = { predict: 10_000, meta: 60_000 };

async function call(path: string, init: RequestInit, timeoutMs: number) {
  if (!config.mlUrl) throw new HttpError(503, "No model service is configured.");
  let res: Response;
  try {
    res = await fetch(`${config.mlUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // A dead or waking service is our outage, not the caller's bad request.
    const why = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
    throw new HttpError(503, `The model service is ${why}.`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // 422 is the only status worth forwarding verbatim: it means the flow the
    // caller sent is malformed, and the service says which feature is missing.
    const detail = (body as { detail?: string } | null)?.detail;
    throw new HttpError(res.status === 422 ? 422 : 502, detail ?? "The model service failed.");
  }
  return body;
}

/** What the console's Model tab renders: the deployed artifact's own metrics. */
mlRouter.get(
  "/model",
  route(async (_req, res) => {
    res.json(await call("/model", { method: "GET" }, TIMEOUT_MS.meta));
  }),
);

/** Classify flows. One detection per flow, in the shape demo.ts fixtures. */
mlRouter.post(
  "/predict",
  route(async (req, res) => {
    const { flows } = validate(predictBody, req.body);
    res.json(
      await call(
        "/predict",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flows }),
        },
        TIMEOUT_MS.predict,
      ),
    );
  }),
);
