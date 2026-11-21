import { Router } from "express";
import { z } from "zod";
import { MAX_FLOWS, callModel, classify } from "../model.js";
import { authGuard, route, validate } from "../middleware.js";

/* Test Mode's path to the model, and the Model tab's metrics. Live Mode does
   not come through here — it arrives at /ingest from an agent holding a sensor
   key, which is a different trust boundary and a different rate limit.

   Guarded now that /dashboard is: this was the other half of that one
   decision, not a second one. */
export const mlRouter = Router();
mlRouter.use(authGuard);

/** Flow rows are numeric columns whose names come from the model, not from us —
 *  validating the keys here would mean duplicating the feature list and letting
 *  it drift. The service rejects a flow missing a feature with a 422, so this
 *  only checks the shape we actually depend on. */
const predictBody = z.object({
  flows: z
    .array(z.record(z.number()))
    .min(1, "Send at least one flow.")
    .max(MAX_FLOWS, `Send at most ${MAX_FLOWS} flows per request.`),
});

/** What the console's Model tab renders: the deployed artifact's own metrics. */
mlRouter.get(
  "/model",
  route(async (_req, res) => {
    res.json(await callModel("/model"));
  }),
);

mlRouter.post(
  "/predict",
  route(async (req, res) => {
    const { flows } = validate(predictBody, req.body);
    res.json({ detections: await classify(flows) });
  }),
);

const indicatorBody = z.object({
  indicator: z.string().min(1, "Indicator must be a valid IP or CIDR."),
  reason: z.string().optional(),
});

mlRouter.get(
  "/threat-intel",
  route(async (_req, res) => {
    res.json(await callModel("/threat-intel/status"));
  }),
);

mlRouter.post(
  "/threat-intel/sync",
  route(async (_req, res) => {
    res.json(await callModel("/threat-intel/sync", { method: "POST" }));
  }),
);

mlRouter.post(
  "/threat-intel/indicators",
  route(async (req, res) => {
    const body = validate(indicatorBody, req.body);
    res.json(
      await callModel("/threat-intel/indicators", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }),
);
