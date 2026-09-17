"use client";

/**
 * Live Mode's producer.
 *
 * Test Mode's data comes from demo.ts; this is the same shapes, from the
 * database. Detections arrive already classified — the browser never calls the
 * model, and neither does the agent: both go through the Express API, which
 * holds the only ML_URL there is.
 */

import { authed } from "./auth";
import type { Detection, Office } from "./demo";

export interface Sensor {
  id: string;
  name: string;
  last_seen_at: string | null;
  /** Reported within the last two minutes. Derived server-side, so one clock
   *  decides it rather than the browser's. */
  live: boolean;
}

export interface FleetNetwork {
  id: string;
  name: string;
  cidr: string;
  sensors: Sensor[];
}

export interface FleetOffice {
  id: string;
  name: string;
  networks: FleetNetwork[];
}

/** Everything the dashboard renders, in one request. A large fleet is hundreds
 *  of sensors, not millions, so the waterfall of per-office calls this saves
 *  costs more than the payload does. */
export interface Snapshot {
  org: string;
  /** Flows analysed, from the per-minute counters. Benign traffic was never
   *  stored as rows, so this is the only place the number exists. */
  traffic: number;
  offices: Office[];
  sensors_total: number;
  sensors_live: number;
  detections: Detection[];
}

export const snapshot = () => authed<Snapshot>("/live");

export const setDetectionStatus = (id: string, status: string) =>
  authed<{ id: string; status: string }>(`/live/detections/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const fleet = () => authed<{ offices: FleetOffice[] }>("/fleet");

export const renameOrg = (name: string) =>
  authed<{ name: string }>("/fleet/org", { method: "PATCH", body: JSON.stringify({ name }) });

export const createOffice = (name: string) =>
  authed<FleetOffice>("/fleet/offices", { method: "POST", body: JSON.stringify({ name }) });

export const createNetwork = (officeId: string, name: string, cidr: string) =>
  authed<FleetNetwork>(`/fleet/offices/${officeId}/networks`, {
    method: "POST",
    body: JSON.stringify({ name, cidr }),
  });

/** The only response that ever carries the key: only its hash is stored, so a
 *  lost key is replaced rather than recovered. */
export const createSensor = (networkId: string, name: string) =>
  authed<Sensor & { key: string }>(`/fleet/networks/${networkId}/sensors`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const deleteOffice = (id: string) =>
  authed<void>(`/fleet/offices/${id}`, { method: "DELETE" });

export const deleteNetwork = (id: string) =>
  authed<void>(`/fleet/networks/${id}`, { method: "DELETE" });

/** Revoked, not deleted — the detections it already reported are evidence. */
export const revokeSensor = (id: string) =>
  authed<void>(`/fleet/sensors/${id}`, { method: "DELETE" });
