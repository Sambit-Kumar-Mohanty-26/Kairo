"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { useConsole } from "@/components/dashboard/DemoProvider";
import { clock } from "@/components/dashboard/DetectionTable";
import { PROFILES, SCENARIOS, type Detection, type Scenario } from "@/lib/demo";

/* The chain from section 7, stage for stage. The rail is the honesty of the
   product made visible: it shows which path the data actually took. */
const PIPELINE = [
  { label: "Flow ingestion", detail: "held-out labelled rows", ms: 620 },
  { label: "Preprocessing", detail: "training-only scaler · selected features", ms: 560 },
  { label: "ML model", detail: "weighted soft voting ensemble", ms: 900 },
  { label: "Detection", detail: "class · confidence", ms: 420 },
  { label: "Database", detail: "written to detection store", ms: 360 },
  { label: "Dashboard", detail: "counters, dial and timeline update", ms: 420 },
];

export default function SimulationPage() {
  const { run, offices } = useConsole();
  const [office, setOffice] = useState("");
  const [sensor, setSensor] = useState("");
  const [scenario, setScenario] = useState<Scenario>("DDoS");
  const [stage, setStage] = useState(-1);
  const [verdict, setVerdict] = useState<Detection | null>(null);
  const [log, setLog] = useState<{ at: number; line: string }[]>([]);
  const verdictRef = useRef<HTMLDivElement>(null);

  const running = stage >= 0 && stage < PIPELINE.length;

  useEffect(() => {
    if (stage < 0 || stage >= PIPELINE.length) return;
    const t = setTimeout(() => setStage((s) => s + 1), PIPELINE[stage].ms);
    return () => clearTimeout(t);
  }, [stage]);

  // The run lands only when the rail finishes, so the counters move at the
  // moment the pipeline says "Dashboard" and not a beat before.
  useEffect(() => {
    if (stage !== PIPELINE.length) return;
    const d = run(scenario, office, sensor);
    setVerdict(d);
    setLog((l) =>
      [
        {
          at: Date.now(),
          line: `${scenario} · conf ${(d.confidence * 100).toFixed(1)}% · risk ${d.risk} · ${office}/${sensor}`,
        },
        ...l,
      ].slice(0, 8),
    );
    setStage(-1);
    // the verdict is the payoff; on a laptop it renders below the fold
    requestAnimationFrame(() =>
      verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Settings can delete the office under us, so the selection is validated
  // against state rather than trusted.
  const officeObj = offices.find((o) => o.name === office) ?? offices[0];
  const sources = officeObj?.sensors ?? [];

  useEffect(() => {
    if (!officeObj) return;
    if (officeObj.name !== office) setOffice(officeObj.name);
    if (!officeObj.sensors.includes(sensor)) setSensor(officeObj.sensors[0] ?? "");
  }, [officeObj, office, sensor]);

  const start = () => {
    setVerdict(null);
    setStage(0);
  };



  return (
    <div className="px-6 sm:px-10 pb-24">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // 03 — Simulation
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          Feed it traffic. Watch it decide.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[56ch]">
          Test Mode replays labelled flows through the same ingestion, preprocessing and
          inference path live traffic would take.
        </p>
      </header>

      <div className="grid lg:grid-cols-[236px_1fr_320px] gap-px bg-[#DCDDCB] border-y border-[#DCDDCB]">
        {/* ---- environment ---- */}
        <section className="bg-[#FFFFEB] py-7 lg:pr-7">
          <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
            Test environment
          </h2>
          <div className="mt-5 flex flex-col gap-5">
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] mb-2">
                Office
              </div>
              <div className="flex flex-col gap-1">
                {offices.map((o) => (
                  <button
                    key={o.name}
                    onClick={() => {
                      setOffice(o.name);
                      setSensor(o.sensors[0]);
                    }}
                    className={`text-left font-serif text-[18px] leading-tight transition-colors duration-200 ${
                      office === o.name ? "text-[#171917]" : "text-[#8A8E86] hover:text-[#62665F]"
                    }`}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] mb-2">
                Source
              </div>
              <div className="flex flex-col gap-1">
                {sources.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSensor(s)}
                    className={`text-left font-mono text-[11.5px] transition-colors duration-200 ${
                      sensor === s ? "text-[#171917]" : "text-[#8A8E86] hover:text-[#62665F]"
                    }`}
                  >
                    {sensor === s ? "▸ " : "  "}
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- scenario deck ---- */}
        <section className="bg-[#FFFFEB] py-7 lg:px-7">
          <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
            Scenario
          </h2>
          <div className="mt-5 flex flex-col divide-y divide-[#E8E8D8] border-y border-[#E8E8D8]">
            {SCENARIOS.map((s) => (
              <button
                key={s}
                disabled={running}
                onClick={() => setScenario(s)}
                className="group flex items-baseline gap-4 py-3.5 text-left disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 self-center transition-colors duration-200 ${
                    scenario === s ? "bg-[#16DFA0]" : "bg-[#DCDDCB]"
                  }`}
                />
                <span
                  className={`font-serif text-[24px] leading-none transition-colors duration-200 ${
                    scenario === s ? "text-[#171917]" : "text-[#8A8E86] group-hover:text-[#62665F]"
                  }`}
                >
                  {s}
                </span>
                <span className="ml-auto font-mono text-[10px] text-[#8A8E86] tabular-nums self-center">
                  exp. risk {PROFILES[s].risk}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={start}
            disabled={running || !sensor}
            className="mt-7 h-[46px] w-full inline-flex items-center justify-center gap-2.5 rounded-full bg-[#171917] text-[#FFFFEB] text-sm font-semibold tracking-tight transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {running ? "Running…" : `Simulate ${scenario}`}
          </button>

          {verdict && (
            <div
              ref={verdictRef}
              className="mt-7 rounded-2xl bg-[#111413] text-white p-6"
              style={{ animation: "cinematicRise 900ms var(--ease-cinematic) both" }}
            >
              <span
                className="font-mono text-[9.5px] uppercase tracking-[0.2em]"
                style={{
                  color:
                    verdict.severity === "critical"
                      ? "#FB7185"
                      : verdict.severity === "warning"
                        ? "#FBBF24"
                        : "#16DFA0",
                }}
              >
                {verdict.attack === "Normal" ? "No threat" : `${verdict.attack} detected`}
              </span>
              <div className="flex items-end gap-8 mt-3">
                <Figure v={`${(verdict.confidence * 100).toFixed(1)}%`} k="Confidence" />
                <Figure
                  v={String(verdict.risk)}
                  k="Risk / 100"
                  tone={
                    verdict.severity === "critical"
                      ? "#FB7185"
                      : verdict.severity === "warning"
                        ? "#FBBF24"
                        : "#16DFA0"
                  }
                />
              </div>
              <div className="mt-5 pt-4 border-t border-white/[0.08] font-mono text-[10.5px] text-[#8A8E86] leading-relaxed">
                {verdict.source} → {verdict.target}
                <br />
                {PROFILES[verdict.attack].evidence}
              </div>
              <Link
                href="/dashboard/threats"
                className="group mt-5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70 hover:text-white transition-colors"
              >
                Open in Threats
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </section>

        {/* ---- pipeline rail ---- */}
        <section className="bg-[#FFFFEB] py-7 lg:pl-7">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
              Pipeline
            </h2>
            {/* ml/ does not exist yet. The rail says so rather than implying a
                model ran. Remove this the day inference is real. */}
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border border-[#D97706]/30 text-[#D97706]">
              Fixture
            </span>
          </div>

          <ol className="mt-5">
            {PIPELINE.map((p, i) => {
              const done = stage > i || (stage === -1 && verdict !== null);
              const active = stage === i;
              return (
                <li key={p.label} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={`w-[7px] h-[7px] rounded-full mt-[7px] shrink-0 transition-all duration-300 ${
                        active ? "bg-[#16DFA0] scale-125" : done ? "bg-[#059669]" : "bg-[#DCDDCB]"
                      }`}
                      style={active ? { boxShadow: "0 0 0 4px rgba(22,223,160,0.18)" } : undefined}
                    />
                    {i < PIPELINE.length - 1 && (
                      <span className="w-px flex-1 min-h-[34px] bg-[#DCDDCB] relative overflow-hidden">
                        <span
                          className="absolute inset-x-0 top-0 bg-[#059669] transition-[height] duration-500 ease-linear"
                          style={{ height: done ? "100%" : "0%" }}
                        />
                      </span>
                    )}
                  </div>
                  <div className="pb-5">
                    <div
                      className={`text-[13.5px] font-medium transition-colors duration-300 ${
                        active || done ? "text-[#171917]" : "text-[#8A8E86]"
                      }`}
                    >
                      {p.label}
                    </div>
                    <div className="font-mono text-[10px] text-[#8A8E86] mt-1 leading-relaxed">
                      {p.detail}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-2 pt-5 border-t border-[#DCDDCB]">
            <h3 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
              Run log
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              {log.length === 0 && (
                <span className="font-mono text-[10.5px] text-[#C9CBBE]">No runs yet</span>
              )}
              {log.map((l, i) => (
                <div key={i} className="font-mono text-[10px] text-[#62665F] leading-relaxed">
                  <span className="text-[#8A8E86]">{clock(l.at)}</span> {l.line}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Figure({ v, k, tone }: { v: string; k: string; tone?: string }) {
  return (
    <div>
      <div className="font-serif text-[38px] leading-none" style={{ color: tone }}>
        {v}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86] mt-2">{k}</div>
    </div>
  );
}
