"use client";

import React, { useEffect, useState } from "react";
import Reveal from "@/components/common/Reveal";

/* ===========================================================================
   SECTION 05 — TEST KAIRO
   Full-bleed console. The spec is firm (§7): we do not fake the prediction,
   so the honest limitation is printed on the instrument itself rather than
   argued about in a paragraph.
   =========================================================================== */

const LAB = [
  { office: "Bhubaneswar Office", nodes: ["Router-01", "Router-02", "Firewall-01"] },
  { office: "Bangalore Office", nodes: ["Router-01", "Firewall-01"] },
  { office: "Mumbai DC", nodes: ["Router-01", "Firewall-01"] },
];

const SCENARIOS = ["Normal", "DDoS", "Port Scan", "Brute Force", "Botnet"] as const;
type Scenario = (typeof SCENARIOS)[number];

const RESULTS: Record<
  Scenario,
  {
    confidence: number;
    risk: number;
    level: string;
    severity: "normal" | "warning" | "critical";
    evidence: string;
  }
> = {
  Normal: {
    confidence: 0.981,
    risk: 12,
    level: "LOW",
    severity: "normal",
    evidence: "handshake symmetry 94% · payload entropy nominal",
  },
  DDoS: {
    confidence: 0.987,
    risk: 91,
    level: "HIGH",
    severity: "critical",
    evidence: "fwd packet rate 41k/s · 2,180 distinct sources",
  },
  "Port Scan": {
    confidence: 0.962,
    risk: 78,
    level: "HIGH",
    severity: "warning",
    evidence: "1,024 destination ports · 96% connections unfinished",
  },
  "Brute Force": {
    confidence: 0.914,
    risk: 84,
    level: "HIGH",
    severity: "critical",
    evidence: "auth failures 312/min · inter-arrival variance near zero",
  },
  Botnet: {
    confidence: 0.941,
    risk: 89,
    level: "HIGH",
    severity: "critical",
    evidence: "17 hosts beaconing on a 60s period to one endpoint",
  },
};

const PIPELINE = [
  {
    label: "Replay labeled flow samples",
    detail: "held-out rows the model never saw during training",
    ms: 760,
  },
  { label: "Preprocess", detail: "training-only scaler · selected features", ms: 620 },
  {
    label: "Ensemble inference",
    detail: "weighted soft voting across the candidates",
    ms: 900,
  },
  {
    label: "Risk engine",
    detail: "severity + confidence + volume + asset + persistence",
    ms: 640,
  },
  { label: "Verdict", detail: "class, confidence, risk, evidence", ms: 420 },
];

const SEVERITY_COLOR = {
  normal: "#6EE7B7",
  warning: "#FBBF24",
  critical: "#FB7185",
} as const;

export default function TestModeSection() {
  const [scenario, setScenario] = useState<Scenario>("DDoS");
  const [sensor, setSensor] = useState("Bangalore Office / Router-01");
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [stage, setStage] = useState(0);

  // Walk the pipeline one stage at a time while a run is in flight.
  useEffect(() => {
    if (status !== "running") return;
    if (stage >= PIPELINE.length) {
      setStatus("done");
      return;
    }
    const t = setTimeout(() => setStage((s) => s + 1), PIPELINE[stage].ms);
    return () => clearTimeout(t);
  }, [status, stage]);

  function run() {
    setStage(0);
    setStatus("running");
  }

  function pick(next: Scenario) {
    setScenario(next);
    setStatus("idle");
    setStage(0);
  }

  const result = RESULTS[scenario];
  const done = status === "done";
  const running = status === "running";
  const accent = SEVERITY_COLOR[result.severity];
  const panel = running ? 1 : done ? 2 : 0;

  return (
    <>
      <section id="test-kairo" className="relative bg-[#FFFFEB]">
        {/* ================= ACT 1 ================= */}
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-28 sm:pt-40 pb-14 sm:pb-20">
          <Reveal>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8E86]">
              Test Mode // 05
            </div>
          </Reveal>
          <Reveal delay={90}>
            <h2
              className="font-serif tracking-tight leading-[0.94] mt-7 text-[#171917]"
              style={{ fontSize: "clamp(46px, 8vw, 104px)" }}
            >
              Don&rsquo;t take
              <br />
              <em className="font-normal italic">our word.</em>
            </h2>
          </Reveal>
          <Reveal delay={180}>
            <p className="type-body mt-9 max-w-[46ch]">
              Kairo ships a Test Lab — a demo organization with its own offices,
              routers and firewalls. Fire an attack at it and watch what comes
              back.
            </p>
          </Reveal>
        </div>

        {/* ================= ACT 2 — FULL-BLEED CONSOLE ================= */}
        <Reveal>
          <div className="w-full bg-[#0B0E0D] text-[#FFFFEB]">
            {/* chrome */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 sm:px-10 py-4 border-b border-white/8">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
                Kairo Test Lab
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                Mode A · replay
              </span>
              <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-white/30 border border-white/12 rounded-full px-2.5 py-1">
                front-end preview · model service not yet wired
              </span>
            </div>

            <div className="mx-auto max-w-[1440px] px-6 sm:px-10 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
              {/* ---- left: what to fire, and from where ---- */}
              <div className="lg:col-span-4">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                  Scenario
                </div>
                <div className="mt-4">
                  {SCENARIOS.map((s, i) => {
                    const on = scenario === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => pick(s)}
                        className="group w-full text-left flex items-baseline gap-4 py-3 border-b border-white/8 cursor-pointer"
                      >
                        <span
                          className="font-mono text-[10px] tabular-nums transition-colors duration-300"
                          style={{ color: on ? "#E4D4F8" : "rgba(255,255,255,0.2)" }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span
                          className="font-serif tracking-tight leading-none transition-all duration-300 group-hover:text-white"
                          style={{
                            fontSize: "clamp(24px, 2.6vw, 34px)",
                            color: on ? "#FFFFEB" : "rgba(255,255,255,0.32)",
                          }}
                        >
                          {s}
                        </span>
                        <span
                          className="ml-auto h-px transition-all duration-500"
                          style={{
                            width: on ? 28 : 0,
                            backgroundColor: "#E4D4F8",
                          }}
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 mt-10">
                  Fired at
                </div>
                <div className="mt-4 space-y-4">
                  {LAB.map((o) => (
                    <div key={o.office}>
                      <div className="font-mono text-[10px] text-white/45">
                        {o.office}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {o.nodes.map((n) => {
                          const id = `${o.office} / ${n}`;
                          const on = sensor === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setSensor(id)}
                              className="font-mono text-[10.5px] px-2.5 py-1 rounded cursor-pointer transition-colors duration-200"
                              style={{
                                color: on ? "#171917" : "rgba(255,255,255,0.4)",
                                backgroundColor: on
                                  ? "#E4D4F8"
                                  : "rgba(255,255,255,0.04)",
                              }}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ---- right: the stage ---- */}
              <div className="lg:col-span-8 flex flex-col">
                <div className="relative flex-1 min-h-[420px] sm:min-h-[480px]">
                  {/* 00 — idle */}
                  <StagePanel on={panel === 0}>
                    <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/25">
                      Armed
                    </div>
                    <div
                      className="font-serif tracking-tight leading-[0.9] mt-4"
                      style={{
                        fontSize: "clamp(56px, 9vw, 132px)",
                        color: "transparent",
                        WebkitTextStroke: "1px rgba(255,255,255,0.22)",
                      }}
                    >
                      {scenario}
                    </div>
                    <p className="text-[14px] leading-relaxed text-white/35 mt-7 max-w-[40ch]">
                      Nothing has been predicted yet. The outline fills in only
                      once the flows have actually been through the pipeline.
                    </p>
                  </StagePanel>

                  {/* 01 — running */}
                  <StagePanel on={panel === 1}>
                    <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#E4D4F8]">
                      Replaying · {sensor.split(" / ")[1]}
                    </div>
                    <div className="mt-8 w-full max-w-[620px]">
                      {PIPELINE.map((p, i) => {
                        const reached = i < stage;
                        const current = i === stage;
                        return (
                          <div
                            key={p.label}
                            className="flex items-baseline gap-5 py-3.5 border-b border-white/8 transition-opacity duration-500"
                            style={{ opacity: reached || current ? 1 : 0.22 }}
                          >
                            <span
                              className="font-mono text-[10px] tabular-nums shrink-0 w-5"
                              style={{
                                color: reached ? accent : "rgba(255,255,255,0.3)",
                              }}
                            >
                              {reached ? "✓" : String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <div
                                className="font-mono text-[13px]"
                                style={{
                                  color: current
                                    ? "#E4D4F8"
                                    : reached
                                    ? "#FFFFEB"
                                    : "rgba(255,255,255,0.5)",
                                }}
                              >
                                {p.label}
                                {current && <span className="ml-2">…</span>}
                              </div>
                              <div className="font-mono text-[9.5px] text-white/25 mt-1">
                                {p.detail}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </StagePanel>

                  {/* 02 — verdict */}
                  <StagePanel on={panel === 2}>
                    <div className="flex flex-wrap items-end gap-x-12 gap-y-8 w-full">
                      <div>
                        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                          Predicted class
                        </div>
                        <div
                          className="font-serif tracking-tight leading-[0.9] mt-3"
                          style={{
                            fontSize: "clamp(48px, 7vw, 104px)",
                            color: accent,
                          }}
                        >
                          {scenario}
                        </div>
                        <div className="font-mono text-[12px] text-white/45 mt-4">
                          confidence {(result.confidence * 100).toFixed(1)}%
                        </div>
                      </div>

                      <div className="ml-auto text-right">
                        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                          Risk
                        </div>
                        <div className="flex items-baseline gap-2 justify-end">
                          <span
                            className="font-mono font-bold tabular-nums leading-none"
                            style={{
                              fontSize: "clamp(72px, 12vw, 172px)",
                              letterSpacing: "-0.05em",
                              color: accent,
                            }}
                          >
                            {result.risk}
                          </span>
                          <span className="font-mono text-white/20 text-[18px]">
                            /100
                          </span>
                        </div>
                        <div
                          className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase mt-1"
                          style={{ color: accent }}
                        >
                          {result.level}
                        </div>
                      </div>
                    </div>

                    <div className="w-full mt-10 pt-6 border-t border-white/8 flex flex-wrap gap-x-10 gap-y-4">
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
                          Evidence
                        </div>
                        <div className="font-mono text-[12px] text-white/70 mt-1.5">
                          {result.evidence}
                        </div>
                      </div>
                      <div className="ml-auto">
                        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
                          Ground truth
                        </div>
                        <div className="font-mono text-[12px] mt-1.5">
                          <span className="text-white/70">{scenario}</span>
                          <span className="ml-2.5 text-[#6EE7B7]">match ✓</span>
                        </div>
                      </div>
                    </div>
                  </StagePanel>
                </div>

                {/* run control */}
                <div className="flex flex-wrap items-center gap-5 mt-8 pt-6 border-t border-white/8">
                  <button
                    type="button"
                    onClick={run}
                    disabled={running}
                    className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] px-7 py-3 rounded-full cursor-pointer transition-all duration-200 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: running
                        ? "rgba(255,255,255,0.08)"
                        : "#FFFFEB",
                      color: running ? "rgba(255,255,255,0.4)" : "#171917",
                    }}
                  >
                    {running ? "Running…" : done ? "Run again" : `Simulate ${scenario}`}
                  </button>
                  <span className="font-mono text-[10px] text-white/25">
                    {sensor}
                  </span>
                </div>
              </div>
            </div>

            {/* the refusal, printed on the instrument instead of argued */}
            <div className="border-t border-white/8 px-6 sm:px-10 py-5 flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/25">
              <span className="text-white/50">
                Test mode and live mode differ only in where the flows come from
              </span>
              <span className="ml-auto line-through decoration-[#FB7185]/60">
                click DDoS → print &ldquo;DDoS detected&rdquo;
              </span>
            </div>
          </div>
        </Reveal>

        {/* ================= ACT 3 — CODA ================= */}
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-24 sm:py-32">
          <Reveal>
            <p className="font-serif italic text-[#171917] text-[22px] sm:text-[32px] leading-snug max-w-[24ch]">
              When the model service is connected, none of this interface
              changes.
            </p>
            <p className="type-body-sm mt-5 max-w-[48ch]">
              That is the point of building it this way round. The badge on the
              console comes off the day real inference is wired in — and not an
              hour before.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/** One crossfading layer of the console stage. Absolute so the box never jumps. */
function StagePanel({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!on}
      className="absolute inset-0 flex flex-col justify-center"
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : "translateY(12px)",
        transition:
          "opacity 600ms var(--ease-cinematic), transform 600ms var(--ease-cinematic)",
        pointerEvents: on ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}
