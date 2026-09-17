"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useConsole } from "@/components/dashboard/DemoProvider";
import StatusBand from "@/components/dashboard/StatusBand";
import RiskDial, { riskColor } from "@/components/dashboard/RiskDial";
import SignalStrip from "@/components/dashboard/SignalStrip";
import DetectionTable, { sevColour } from "@/components/dashboard/DetectionTable";
import DetailPane from "@/components/dashboard/DetailPane";
import { CRITICAL_AT, attackMix, type Detection } from "@/lib/demo";

/** One colour per family. All seven, because the mix is now counted off the
 *  detections and any of them can appear. */
const MIX_COLOUR: Record<string, string> = {
  DDoS: "#E11D48",
  DoS: "#F43F5E",
  "Port Scan": "#D97706",
  "Brute Force": "#059669",
  "Web Attack": "#7C3AED",
  Botnet: "#8A8E86",
};

export default function OverviewPage() {
  const { detections, traffic, risk, threats, critical, landed, setStatus, office, mode, live } =
    useConsole();
  const [selected, setSelected] = useState<Detection | null>(null);

  const mix = useMemo(() => attackMix(detections), [detections]);
  const mixTotal = mix.reduce((n, [, c]) => n + c, 0) || 1;
  const newest = detections[0];

  return (
    <div className="px-6 sm:px-10 pb-24">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // 01 — Overview
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          {critical > 0 ? (
            <>
              {critical} incident{critical === 1 ? "" : "s"} still need you.
            </>
          ) : (
            <>Nothing is asking for you.</>
          )}
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[52ch]">
          {office === "all" ? "Across all offices" : `In ${office}`}, over the last 24 hours.
        </p>
      </header>

      <StatusBand
        items={[
          { label: "Traffic", value: traffic },
          { label: "Threats", value: threats },
          { label: "Critical", value: critical, tone: critical > 0 ? "#E11D48" : undefined },
          { label: "Risk Score", value: risk, tone: riskColor(risk) === "#16DFA0" ? "#059669" : riskColor(risk) === "#FBBF24" ? "#D97706" : "#E11D48" },
        ]}
      />

      {/* the instrument: dial + live signal, one dark face */}
      <div className="mt-10 rounded-2xl sm:rounded-3xl bg-[#111413] text-white border border-white/[0.08] shadow-[0_16px_36px_-6px_rgba(17,20,19,0.16)] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-white">
            Live Signal
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#8A8E86]">
            {mode === "live"
              ? `Live Mode · ${live.sensorsLive} of ${live.sensorsTotal} sensors`
              : "Test Mode · fixture feed"}
          </span>
        </div>
        <div className="grid md:grid-cols-[280px_1fr] divide-y md:divide-y-0 md:divide-x divide-white/[0.08]">
          <div className="p-7 flex items-center justify-center">
            <RiskDial value={risk} />
          </div>
          <div className="p-7 flex flex-col justify-center gap-5">
            <SignalStrip landed={landed} severity={newest?.severity ?? "normal"} />
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8E86]">
              <span>{mode === "live" ? "Flows analysed · 24h" : "Flows / second"}</span>
              <span className="tabular-nums text-white">
                {mode === "live" ? traffic.toLocaleString() : (traffic % 900) + 180}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* attack mix — a rule, not a pie */}
      <section className="mt-14">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Attack mix
        </h2>
        <div className="mt-4 flex h-[6px] rounded-full overflow-hidden bg-[#E8E8D8]">
          {mix.map(([a, c]) => (
            <span
              key={a}
              style={{
                width: `${(c / mixTotal) * 100}%`,
                background: MIX_COLOUR[a],
                transition: "width 900ms var(--ease-cinematic)",
              }}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          {mix.map(([a, c]) => (
            <span key={a} className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: MIX_COLOUR[a] }} />
              <span className="text-[13.5px] text-[#62665F]">{a}</span>
              <span className="font-serif text-[18px] tabular-nums">{c}</span>
            </span>
          ))}
        </div>
      </section>

      {/* 24h attack timeline */}
      <section className="mt-14">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Attack timeline · 24h
        </h2>
        <div className="mt-5 relative h-[68px] border-b border-[#DCDDCB]">
          {detections.map((d) => {
            const ago = Date.now() - d.at;
            const pct = 100 - Math.min(100, (ago / 86_400_000) * 100);
            return (
              <button
                key={d.id}
                onClick={() => setSelected(d)}
                title={`${d.attack} · risk ${d.risk}`}
                className="absolute bottom-0 w-px hover:w-[3px] transition-all duration-150"
                style={{
                  left: `${pct}%`,
                  height: `${18 + (d.risk / 100) * 46}px`,
                  background: sevColour(d),
                  opacity: d.risk >= CRITICAL_AT ? 1 : 0.45,
                  animation: landed === d.id ? "cinematicFade 900ms var(--ease-cinematic) both" : undefined,
                }}
              />
            );
          })}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86]">
          <span>24h ago</span>
          <span>Now</span>
        </div>
      </section>

      {/* recent detections */}
      <section className="mt-14">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
            Recent detections
          </h2>
          <Link
            href="/dashboard/threats"
            className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#62665F] hover:text-[#171917] transition-colors"
          >
            All threats
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <DetectionTable detections={detections.slice(0, 6)} onSelect={setSelected} compact />
        </div>
      </section>

      <DetailPane detection={selected} onClose={() => setSelected(null)} onStatus={setStatus} />
    </div>
  );
}
