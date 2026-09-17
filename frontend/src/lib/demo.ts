/* ===========================================================================
   The console's data, before the console has a producer.

   Traffic, detections and offices here are fixtures — the pipeline rail
   prints FIXTURE on every run, and §7 is explicit that Test Mode must run the
   real model, so this module gets replaced by fetches once the service is
   wired. What is NOT a fixture any more: DEPLOYED, ENSEMBLE and every risk
   below are read off the trained artifact (ml/artifacts/metrics.json), and
   each PROFILE's risk is exactly what risk_of() in ml/src/kairo_ml/config.py
   returns for that class at that confidence. CANDIDATE is the one version
   that has not been trained, and it says so.

   The opening figures are the notes' own (§8): 125,432 / 42 / 7 / 78.
   =========================================================================== */

/* Seven, in the order CLASSES uses in ml/src/kairo_ml/config.py. DoS is its
   own class and never folded into DDoS — the landing page makes a point of
   it, so the console cannot quietly ship five. */
export const SCENARIOS = [
  "Normal",
  "DDoS",
  "DoS",
  "Port Scan",
  "Brute Force",
  "Web Attack",
  "Botnet",
] as const;
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
    evidence: "packet length mean nominal · idle time nominal",
    features: [
      { name: "Flow Duration", weight: 0.22 },
      { name: "Packet Length Mean", weight: 0.19 },
      { name: "Flow IAT Std", weight: 0.15 },
      { name: "Bwd Packets/s", weight: 0.12 },
      { name: "Init_Win_bytes_forward", weight: 0.09 },
    ],
  },
  DDoS: {
    confidence: 0.984,
    risk: 91,
    severity: "critical",
    evidence: "fwd packet rate 41k/s · fwd packet length mean 66B",
    features: [
      { name: "Fwd Packet Length Mean", weight: 0.27 },
      { name: "Fwd Packets/s", weight: 0.23 },
      { name: "Flow IAT Mean", weight: 0.18 },
      { name: "Init_Win_bytes_forward", weight: 0.14 },
      { name: "Packet Length Variance", weight: 0.09 },
    ],
  },
  DoS: {
    confidence: 0.972,
    risk: 84,
    severity: "warning",
    evidence: "idle min 4.2s on an open connection · active max 61s",
    features: [
      { name: "Idle Min", weight: 0.28 },
      { name: "Active Max", weight: 0.22 },
      { name: "Flow Duration", weight: 0.18 },
      { name: "Fwd Packets/s", weight: 0.13 },
      { name: "Packet Length Mean", weight: 0.09 },
    ],
  },
  "Port Scan": {
    confidence: 0.967,
    risk: 77,
    severity: "warning",
    evidence: "1,024 destination ports · min fwd segment 20B",
    features: [
      { name: "Destination Port", weight: 0.31 },
      { name: "Init_Win_bytes_forward", weight: 0.22 },
      { name: "Flow Duration", weight: 0.17 },
      { name: "min_seg_size_forward", weight: 0.12 },
      { name: "Bwd Packet Length Min", weight: 0.1 },
    ],
  },
  "Brute Force": {
    confidence: 0.914,
    risk: 80,
    severity: "warning",
    evidence: "bwd inter-arrival variance near zero · 312 attempts/min",
    features: [
      { name: "Flow Duration", weight: 0.26 },
      { name: "Fwd IAT Std", weight: 0.21 },
      { name: "Bwd IAT Std", weight: 0.17 },
      { name: "Init_Win_bytes_forward", weight: 0.13 },
      { name: "Bwd IAT Total", weight: 0.11 },
    ],
  },
  "Web Attack": {
    confidence: 0.958,
    risk: 86,
    severity: "warning",
    evidence: "fwd inter-arrival min 0.4ms · flow IAT min flat",
    features: [
      { name: "Fwd IAT Min", weight: 0.26 },
      { name: "Flow IAT Min", weight: 0.21 },
      { name: "Fwd IAT Std", weight: 0.18 },
      { name: "Init_Win_bytes_backward", weight: 0.14 },
      { name: "Bwd Packets/s", weight: 0.1 },
    ],
  },
  Botnet: {
    confidence: 0.978,
    risk: 89,
    severity: "critical",
    evidence: "60s beacon interval to port 8080 · 2.3kB per exchange",
    features: [
      { name: "Flow IAT Mean", weight: 0.29 },
      { name: "Bwd IAT Min", weight: 0.2 },
      { name: "Destination Port", weight: 0.16 },
      { name: "Flow Duration", weight: 0.14 },
      { name: "min_seg_size_forward", weight: 0.1 },
    ],
  },
};

export const RESPONSES: Record<Scenario, string[]> = {
  Normal: [],
  DDoS: ["Block source", "Rate-limit edge", "Isolate target"],
  DoS: ["Block source", "Drop half-open connections", "Isolate target"],
  "Port Scan": ["Block source", "Investigate", "Tighten firewall rule"],
  "Brute Force": ["Block source", "Force credential reset", "Investigate"],
  "Web Attack": ["Block source", "Patch endpoint", "Investigate"],
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
      // Fixture noise, NOT risk_of(): the real formula is ceiling x confidence
      // and every profile below obeys it, but applied to 42 attack rows it puts
      // almost all of them over CRITICAL_AT and the log reads as one flat wall
      // of red. The seeded log spreads severity instead and keeps the notes'
      // 7 criticals. Test Mode and the detail pane use the formula.
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
  // Counted off the detections themselves, not off MIX's seed distribution:
  // Test Mode can simulate DoS and Web Attack and Live Mode reports whatever
  // the model named, and both were invisible in the legend while this mapped
  // over a fixed list of four. Zeroes are dropped — a legend entry for
  // something that did not happen is noise.
  return SCENARIOS.filter((a) => a !== "Normal")
    .map((a) => [a, d.filter((x) => x.attack === a).length] as [Scenario, number])
    .filter(([, n]) => n > 0);
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

/** The naming stage's three base models, weighted the way the deployed
    artifact actually weights them: mean |coefficient| of the stacked logistic
    meta-learner over each member's block, normalised. Not the hand-set
    40/35/25 the voting alternative used — the point of stacking is that it
    fits these, and fitted, they come out nearly even. */
export const ENSEMBLE: { name: string; weight: number; note: string }[] = [
  { name: "Random Forest", weight: 0.3231, note: "300 trees · gini" },
  { name: "Extra Trees", weight: 0.3594, note: "300 trees · entropy" },
  { name: "XGBoost", weight: 0.3175, note: "400 rounds · depth 8" },
];

/** ml/artifacts/metrics.json, verbatim. Gate 01 (XGBoost, binary) then
    gate 02 (stacking over the three members above). It is not the highest
    macro-F1 in section 03's table and that is deliberate — flat stacking
    scores 0.0003 more, inside the noise of a 389-row class. */
export const DEPLOYED: Version = {
  tag: "v1.0-cascade",
  trainedAt: "2026-09-17",
  dataset: "CICIDS2017 · 253,240 flows",
  accuracy: 0.9989,
  macroF1: 0.9945,
  classes: [
    { cls: "Normal", precision: 0.9992, recall: 0.9977, f1: 0.9984, support: 12_000 },
    { cls: "DDoS", precision: 0.9997, recall: 0.9998, f1: 0.9997, support: 12_000 },
    { cls: "DoS", precision: 0.999, recall: 0.9994, f1: 0.9992, support: 12_000 },
    { cls: "Port Scan", precision: 0.9994, recall: 0.9992, f1: 0.9993, support: 12_000 },
    { cls: "Brute Force", precision: 0.9995, recall: 0.9995, f1: 0.9995, support: 1_830 },
    { cls: "Web Attack", precision: 0.9861, recall: 0.9953, f1: 0.9907, support: 429 },
    { cls: "Botnet", precision: 0.9603, recall: 0.9949, f1: 0.9746, support: 389 },
  ],
};

/** Not trained. This is the shape the Model tab's gate compares against
    once the pool below clears RETRAIN_AT and a run actually happens; the
    figures are a target to beat, not a measurement, which is why the tag says
    so and the dataset line names flows we have not collected yet. */
export const CANDIDATE: Version = {
  tag: "v1.1-rc1 (not run)",
  trainedAt: "—",
  dataset: "CICIDS2017 + console-validated flows · pending",
  accuracy: 0.999,
  macroF1: 0.9955,
  classes: [
    { cls: "Normal", precision: 0.9993, recall: 0.998, f1: 0.9986, support: 12_000 },
    { cls: "DDoS", precision: 0.9998, recall: 0.9998, f1: 0.9998, support: 12_000 },
    { cls: "DoS", precision: 0.9992, recall: 0.9995, f1: 0.9993, support: 12_000 },
    { cls: "Port Scan", precision: 0.9995, recall: 0.9994, f1: 0.9994, support: 12_000 },
    { cls: "Brute Force", precision: 0.9996, recall: 0.9996, f1: 0.9996, support: 1_830 },
    { cls: "Web Attack", precision: 0.9885, recall: 0.9953, f1: 0.9919, support: 429 },
    { cls: "Botnet", precision: 0.9702, recall: 0.9949, f1: 0.9824, support: 389 },
  ],
};

/** The notes' retraining pool. Console verdicts are added on top, live. */
export const POOL: [string, number][] = [
  ["Normal", 15_420],
  ["DDoS", 2_341],
  ["Port Scan", 1_203],
  ["Brute Force", 892],
  ["DoS", 604],
  ["Web Attack", 118],
];

/** A retrain is worth running once this many validated flows have collected. */
export const RETRAIN_AT = 25_000;

/** The deployed cascade's own importances, both stages averaged and
    renormalised over all 30 features, from ml/artifacts/model.joblib. Summing
    the fixture profiles instead used to surface columns that selection had
    dropped. `Bwd Packet Length Min` really is 47% of it: it is the gate's
    first split, and a flow with nothing coming back is most of what the gate
    needs to know. */
const IMPORTANCE: Feature[] = [
  { name: "Bwd Packet Length Min", weight: 0.471 },
  { name: "Init_Win_bytes_backward", weight: 0.076 },
  { name: "min_seg_size_forward", weight: 0.061 },
  { name: "Destination Port", weight: 0.049 },
  { name: "Fwd Packet Length Max", weight: 0.046 },
  { name: "Packet Length Mean", weight: 0.035 },
  { name: "Fwd Packet Length Min", weight: 0.025 },
  { name: "Packet Length Variance", weight: 0.023 },
];

export const featureImportance = (): Feature[] => IMPORTANCE;

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
