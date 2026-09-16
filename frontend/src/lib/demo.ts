/* ===========================================================================
   The console's data, before the console has a producer.

   ml/ does not exist yet, so nothing here is a model verdict. Every number is
   a fixture and the UI says so — the pipeline rail prints FIXTURE on every
   run. §7 is explicit that Test Mode must run the real model, so the moment
   ml/ is live this module is replaced by fetches and the rail stops lying.

   The opening figures are the notes' own (§8): 125,432 / 42 / 7 / 78.
   =========================================================================== */

export const SCENARIOS = ["Normal", "DDoS", "Port Scan", "Brute Force", "Botnet"] as const;
export type Scenario = (typeof SCENARIOS)[number];
export type Severity = "normal" | "warning" | "critical";
export type Status = "new" | "acknowledged" | "investigating" | "resolved" | "false-positive";

/** Risk at or above this is CRITICAL. The seed puts exactly 7 above it. */
export const CRITICAL_AT = 88;

export type Feature = { name: string; weight: number };

export type Detection = {
  id: string;
  at: number;
  attack: Scenario;
  source: string;
  target: string;
  office: string;
  sensor: string;
  confidence: number;
  risk: number;
  severity: Severity;
  features: Feature[];
  status: Status;
};

export type Office = { name: string; sensors: string[] };

/** The starting set. Once the console is running, offices live in state so
    Settings can create them — steps 2 and 3 of the user journey. */
export const OFFICES: Office[] = [
  { name: "Bhubaneswar", sensors: ["Router-01", "Router-02", "Firewall-01"] },
  { name: "Bangalore", sensors: ["Router-01", "Firewall-01"] },
  { name: "Mumbai", sensors: ["Router-01", "Firewall-01", "Sensor-01"] },
];

/* Feature names are CICIDS2017 columns, not invented — the whole claim of the
   product is that a verdict can be traced to the flow statistics behind it. */
export const PROFILES: Record<
  Scenario,
  { confidence: number; risk: number; severity: Severity; evidence: string; features: Feature[] }
> = {
  Normal: {
    confidence: 0.981,
    risk: 12,
    severity: "normal",
    evidence: "handshake symmetry 94% · payload entropy nominal",
    features: [
      { name: "Flow Duration", weight: 0.22 },
      { name: "Average Packet Size", weight: 0.19 },
      { name: "Flow IAT Std", weight: 0.15 },
      { name: "Total Backward Packets", weight: 0.12 },
      { name: "Init_Win_bytes_forward", weight: 0.09 },
    ],
  },
  DDoS: {
    confidence: 0.984,
    risk: 91,
    severity: "critical",
    evidence: "fwd packet rate 41k/s · 2,180 distinct sources",
    features: [
      { name: "Flow Bytes/s", weight: 0.27 },
      { name: "Fwd Packets/s", weight: 0.23 },
      { name: "Flow IAT Mean", weight: 0.18 },
      { name: "Total Fwd Packets", weight: 0.14 },
      { name: "Packet Length Std", weight: 0.09 },
    ],
  },
  "Port Scan": {
    confidence: 0.967,
    risk: 78,
    severity: "warning",
    evidence: "1,024 destination ports · 96% connections unfinished",
    features: [
      { name: "Destination Port", weight: 0.31 },
      { name: "Init_Win_bytes_forward", weight: 0.22 },
      { name: "Flow Duration", weight: 0.17 },
      { name: "SYN Flag Count", weight: 0.12 },
      { name: "Total Length of Fwd Packets", weight: 0.1 },
    ],
  },
  "Brute Force": {
    confidence: 0.914,
    risk: 84,
    severity: "critical",
    evidence: "auth failures 312/min · inter-arrival variance near zero",
    features: [
      { name: "Flow Duration", weight: 0.26 },
      { name: "Fwd IAT Std", weight: 0.21 },
      { name: "Total Backward Packets", weight: 0.17 },
      { name: "Init_Win_bytes_forward", weight: 0.13 },
      { name: "Average Packet Size", weight: 0.11 },
    ],
  },
  Botnet: {
    confidence: 0.941,
    risk: 89,
    severity: "critical",
    evidence: "17 hosts beaconing on a 60s period to one endpoint",
    features: [
      { name: "Flow IAT Mean", weight: 0.29 },
      { name: "Bwd Packet Length Mean", weight: 0.2 },
      { name: "Subflow Fwd Bytes", weight: 0.16 },
      { name: "Flow Duration", weight: 0.14 },
      { name: "act_data_pkt_fwd", weight: 0.1 },
    ],
  },
};

export const RESPONSES: Record<Scenario, string[]> = {
  Normal: [],
  DDoS: ["Block source", "Rate-limit edge", "Isolate target"],
  "Port Scan": ["Block source", "Investigate", "Tighten firewall rule"],
  "Brute Force": ["Block source", "Force credential reset", "Investigate"],
  Botnet: ["Isolate hosts", "Block C2 endpoint", "Investigate"],
};

/* Deterministic so the server render and the client render agree. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** §8's mix: DDoS 15 · Port Scan 18 · Brute Force 7 · Botnet 2 = 42. */
const MIX: [Scenario, number][] = [
  ["DDoS", 15],
  ["Port Scan", 18],
  ["Brute Force", 7],
  ["Botnet", 2],
];

export const SEED_TRAFFIC = 125432;
export const SEED_RISK = 78;

/**
 * 42 detections across the last 24h, of which exactly 7 clear CRITICAL_AT —
 * built in rather than jittered into place, so the headline figures stay the
 * notes' figures.
 */
export function seedDetections(now: number): Detection[] {
  const rand = rng(0x4b41524f);
  const attacks: Scenario[] = MIX.flatMap(([a, n]) => Array<Scenario>(n).fill(a));
  // Interleave them. Laid out in mix order the log reads as 15 DDoS, then 18
  // port scans — a night on a real network does not arrive sorted by class.
  for (let i = attacks.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [attacks[i], attacks[j]] = [attacks[j], attacks[i]];
  }
  // 7 critical slots, spread deterministically through the 42.
  const criticalSlots = new Set([2, 6, 11, 17, 24, 31, 38]);

  return attacks
    .map((attack, i) => {
      const p = PROFILES[attack];
      const office = OFFICES[Math.floor(rand() * OFFICES.length)];
      const sensor = office.sensors[Math.floor(rand() * office.sensors.length)];
      const crit = criticalSlots.has(i);
      const risk = crit
        ? CRITICAL_AT + Math.floor(rand() * 9)
        : 42 + Math.floor(rand() * (CRITICAL_AT - 43));
      return {
        id: `det-${String(i).padStart(3, "0")}`,
        // spread back over 24h, newest first once sorted
        at: now - Math.floor((i + rand()) * (86_400_000 / 42)),
        attack,
        source: `192.168.${10 + Math.floor(rand() * 4)}.${20 + Math.floor(rand() * 200)}`,
        target: `192.168.10.${100 + Math.floor(rand() * 50)}`,
        office: office.name,
        sensor,
        confidence: Math.round((p.confidence - rand() * 0.06) * 1000) / 1000,
        risk,
        severity: (risk >= CRITICAL_AT ? "critical" : risk >= 70 ? "warning" : "normal") as Severity,
        features: p.features,
        status: (crit ? "new" : i % 3 === 0 ? "acknowledged" : "resolved") as Status,
      };
    })
    .sort((a, b) => b.at - a.at);
}

let runCount = 0;

/** The verdict a simulation run produces. Same shape a real detection has. */
export function simulateDetection(attack: Scenario, office: string, sensor: string): Detection {
  const p = PROFILES[attack];
  const rand = rng(0x51_00_00 + runCount++);
  return {
    id: `sim-${Date.now().toString(36)}`,
    at: Date.now(),
    attack,
    // §9's own addresses, so the demo matches the notes line for line.
    source: attack === "Port Scan" ? "192.168.10.54" : "192.168.10.42",
    target: "192.168.10.100",
    office,
    sensor,
    confidence: p.confidence,
    risk: p.risk,
    severity: p.severity,
    features: p.features,
    status: "new",
  };
}

export const criticalCount = (d: Detection[]) => d.filter((x) => x.risk >= CRITICAL_AT).length;

export function attackMix(d: Detection[]): [Scenario, number][] {
  return MIX.map(([a]) => [a, d.filter((x) => x.attack === a).length]);
}

/* ---------------------------------------------------------------------------
   Model (06) and Reports (07) fixtures.

   Same caveat as everything above: no model has run. These are the shapes the
   training service will return — versions, per-class metrics, the pool that
   feeds the next run, and the candidate waiting on the gate.
   --------------------------------------------------------------------------- */

export type ClassMetric = { cls: string; precision: number; recall: number; f1: number; support: number };
export type Version = {
  tag: string;
  trainedAt: string;
  dataset: string;
  accuracy: number;
  macroF1: number;
  classes: ClassMetric[];
};

/** Weighted soft voting: each member votes a probability, weights decide. */
export const ENSEMBLE: { name: string; weight: number; note: string }[] = [
  { name: "Random Forest", weight: 0.4, note: "300 trees · gini" },
  { name: "XGBoost", weight: 0.35, note: "400 rounds · depth 8" },
  { name: "Extra Trees", weight: 0.25, note: "300 trees · entropy" },
];

export const DEPLOYED: Version = {
  tag: "v1.0",
  trainedAt: "2026-08-02",
  dataset: "CICIDS2017 · 2.27M flows",
  accuracy: 0.992,
  macroF1: 0.974,
  classes: [
    { cls: "Normal", precision: 0.996, recall: 0.998, f1: 0.997, support: 452_318 },
    { cls: "DDoS", precision: 0.989, recall: 0.994, f1: 0.991, support: 128_027 },
    { cls: "Port Scan", precision: 0.981, recall: 0.972, f1: 0.976, support: 90_694 },
    { cls: "Brute Force", precision: 0.947, recall: 0.921, f1: 0.934, support: 9_150 },
    { cls: "Botnet", precision: 0.932, recall: 0.884, f1: 0.907, support: 1_966 },
  ],
};

/** Trained on the pool below. It only ships if it beats v1 on every class. */
export const CANDIDATE: Version = {
  tag: "v2.0-rc1",
  trainedAt: "2026-09-16",
  dataset: "CICIDS2017 + 19,856 validated flows",
  accuracy: 0.994,
  macroF1: 0.981,
  classes: [
    { cls: "Normal", precision: 0.997, recall: 0.998, f1: 0.998, support: 467_738 },
    { cls: "DDoS", precision: 0.993, recall: 0.996, f1: 0.994, support: 130_368 },
    { cls: "Port Scan", precision: 0.986, recall: 0.979, f1: 0.982, support: 91_897 },
    { cls: "Brute Force", precision: 0.958, recall: 0.944, f1: 0.951, support: 10_042 },
    { cls: "Botnet", precision: 0.929, recall: 0.901, f1: 0.915, support: 1_966 },
  ],
};

/** The notes' retraining pool. Console verdicts are added on top, live. */
export const POOL: [string, number][] = [
  ["Normal", 15_420],
  ["DDoS", 2_341],
  ["Port Scan", 1_203],
  ["Brute Force", 892],
];

/** A retrain is worth running once this many validated flows have collected. */
export const RETRAIN_AT = 20_000;

/** Aggregate importance across the classes the model separates. */
export function featureImportance(): Feature[] {
  const t = new Map<string, number>();
  for (const p of Object.values(PROFILES))
    for (const f of p.features) t.set(f.name, (t.get(f.name) ?? 0) + f.weight);
  const total = [...t.values()].reduce((a, b) => a + b, 0);
  return [...t]
    .map(([name, w]) => ({ name, weight: w / total }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
}

/** Detections inside a window, newest first. */
export const since = (d: Detection[], ms: number) => d.filter((x) => Date.now() - x.at <= ms);

export function topSources(d: Detection[], n = 6) {
  const t = new Map<string, { hits: number; worst: number; attack: Scenario }>();
  for (const x of d) {
    const e = t.get(x.source);
    if (!e || x.risk > e.worst) t.set(x.source, { hits: (e?.hits ?? 0) + 1, worst: x.risk, attack: x.attack });
    else e.hits++;
  }
  return [...t]
    .sort((a, b) => b[1].worst - a[1].worst || b[1].hits - a[1].hits)
    .slice(0, n)
    .map(([source, v]) => ({ source, ...v }));
}
