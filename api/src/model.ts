import { config } from "./config.js";
import { HttpError } from "./middleware.js";

/* The one place that knows where the Python service lives. The browser never
   talks to it, and neither does the agent — both go through Express, so the
   model can be moved, scaled or replaced without redeploying either. */

/** Generous, because the ML service is on a plan that sleeps: the first call
 *  after 15 minutes idle pays ~50s of wake plus a 4s unpickle, and a 10s
 *  timeout turns that into a 503 that looks like an outage. A warm predict is
 *  ~140ms, so anything past a second or two is a cold start, not slowness.
 *  Drop to 10s once the service is always-on. */
const TIMEOUT_MS = 60_000;

/** The service caps at 500. A lower cap keeps one caller from holding the
 *  single uvicorn worker while every other request queues, and it is the same
 *  number the agent batches to. */
export const MAX_FLOWS = 100;

export interface Verdict {
  attack: string;
  confidence: number;
  risk: number;
  severity: string;
  features: { name: string; weight: number }[];
  model: string;
}

export async function callModel<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!config.mlUrl) throw new HttpError(503, "No model service is configured.");
  let res: Response;
  try {
    res = await fetch(`${config.mlUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
  return body as T;
}

/** Classify flows. One verdict per flow, in order. */
export async function classify(flows: Record<string, number>[]): Promise<Verdict[]> {
  const { detections } = await callModel<{ detections: Verdict[] }>("/predict", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ flows }),
  });
  return detections;
}
