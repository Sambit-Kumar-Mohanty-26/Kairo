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

export type SensorStatus = "online" | "degraded" | "offline" | "revoked" | "pending";

export interface Sensor {
  id: string;
  name: string;
  last_seen_at: string | null;
  /** Reported within the last two minutes. Derived server-side, so one clock
   *  decides it rather than the browser's. */
  live: boolean;
  status?: SensorStatus;
  version?: string;
  capture_status?: string;
  interface?: string;
  packets_observed?: number;
  flows_extracted?: number;
  pending_batches?: number;
  queue_bytes?: number;
  last_heartbeat_at?: string | null;
  last_upload_at?: string | null;
  recent_warning?: string | null;
  troubleshooting?: string;
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

export const getSensor = (sensorId: string) =>
  authed<Sensor & { network: { id: string; name: string; cidr: string }; office: { id: string; name: string }; troubleshooting: string }>(
    `/fleet/sensors/${sensorId}`,
  );

export const getSensorHistory = (sensorId: string) =>
  authed<{
    sensor_id: string;
    history: Array<{
      id: string;
      at: string;
      status: string;
      capture_status?: string | null;
      packets_observed: number;
      flows_extracted: number;
      pending_batches: number;
      queue_bytes: number;
      warning?: string | null;
    }>;
  }>(`/fleet/sensors/${sensorId}/history`);

export interface ThreatIntelStatus {
  total_ips: number;
  total_subnets: number;
  last_synced_at: string | null;
  cache_file: string;
  cache_exists: boolean;
  feeds_configured: string[];
  background_sync_active: boolean;
}

export const getThreatIntelStatus = () => authed<ThreatIntelStatus>("/ml/threat-intel");

export const syncThreatIntel = () =>
  authed<{ ok: boolean; new_ips_fetched: number; total_ips: number }>("/ml/threat-intel/sync", {
    method: "POST",
  });

export const addCustomIndicator = (indicator: string, reason?: string) =>
  authed<{ ok: boolean; indicator: string }>("/ml/threat-intel/indicators", {
    method: "POST",
    body: JSON.stringify({ indicator, reason }),
  });

/* Active Mitigation (IPS Quarantine) */
export interface QuarantineRule {
  id: string;
  sourceIp: string;
  reason: string;
  attack?: string | null;
  risk: number;
  severity?: string | null;
  status: "active" | "released" | "expired";
  createdAt: string;
  unblockedAt?: string | null;
}

export const getQuarantineRules = (status?: string) =>
  authed<{ rules: QuarantineRule[] }>(`/mitigation/rules${status ? `?status=${status}` : ""}`);

export const getQuarantineStats = () =>
  authed<{
    activeBlocks: number;
    releasedBlocks: number;
    automatedBlocks: number;
    recentBlocks: Array<{ id: string; sourceIp: string; attack?: string; risk: number; status: string; createdAt: string }>;
    firewallDriver: string;
  }>("/mitigation/status");

export const quarantineIp = (sourceIp: string, reason = "MANUAL_ANALYST_BLOCK", risk = 90, attack?: string) =>
  authed<{ rule: QuarantineRule; driverResult: any; layer4Synced: boolean }>("/mitigation/block", {
    method: "POST",
    body: JSON.stringify({ sourceIp, reason, risk, attack }),
  });

export const releaseIp = (ruleId?: string, sourceIp?: string) =>
  authed<{ rule: QuarantineRule; driverResult: any }>("/mitigation/unblock", {
    method: "POST",
    body: JSON.stringify({ ruleId, sourceIp }),
  });

/* Enterprise Webhooks & SIEM */
export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  format: "discord" | "slack" | "generic";
  minRisk: number;
  enabled: boolean;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  createdAt: string;
}

export const getWebhooks = () => authed<{ webhooks: WebhookEndpoint[] }>("/notifications/webhooks");

export const createWebhook = (data: { name: string; url: string; format?: string; minRisk?: number; secret?: string }) =>
  authed<{ webhook: WebhookEndpoint }>("/notifications/webhooks", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const deleteWebhook = (id: string) =>
  authed<{ ok: boolean }>(`/notifications/webhooks/${id}`, { method: "DELETE" });

export const toggleWebhook = (id: string) =>
  authed<{ webhook: WebhookEndpoint }>(`/notifications/webhooks/${id}/toggle`, { method: "PATCH" });

export const testWebhook = (url: string, format = "discord") =>
  authed<{ success: boolean; statusCode?: number; error?: string }>("/notifications/test", {
    method: "POST",
    body: JSON.stringify({ url, format }),
  });
