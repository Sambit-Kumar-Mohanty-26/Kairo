"use client";

import React, { useRef, useState, useEffect } from "react";

/* ===========================================================================
   SECTION 02 — THE READING
   One flow record stays on screen from first frame to last. It is observed,
   decomposed into evidence, classified, and priced as risk. Scroll scrubs it.
   Values mirror the DDOS scenario in KairoField so the two sections agree.
   =========================================================================== */

const SUBJECT = {
  src: "10.20.14.52:51204",
  dst: "10.20.1.100:443",
  proto: "TCP",
  bytes: "1842B",
  dur: "0.412s",
  flags: "SYN×214",
};

const EVIDENCE = [
  { key: "fwd_pkt_rate", label: "Forward packet rate", read: "214 SYN in 0.41s — 98th percentile", value: 98 },
  { key: "syn_ack_ratio", label: "SYN / ACK asymmetry", read: "214 sent · 3 acknowledged", value: 92 },
  { key: "pkt_len_var", label: "Packet length variance", read: "σ 12.4B — uniform, machine-shaped", value: 81 },
  { key: "flow_duration", label: "Flow duration", read: "0.412s — truncated, no teardown", value: 74 },
];

const CLASSES = [
  { name: "DDoS", p: 0.947 },
  { name: "Port Scan", p: 0.021 },
  { name: "Botnet", p: 0.018 },
  { name: "Brute Force", p: 0.009 },
  { name: "Normal", p: 0.005 },
];

const RISK_INPUTS = [
  { label: "Attack severity", v: 0.92 },
  { label: "Model confidence", v: 0.95 },
  { label: "Traffic volume", v: 0.88 },
  { label: "Asset criticality", v: 0.90 },
  { label: "Persistence", v: 0.71 },
];

const RISK_SCORE = 91;

const STAGES = [
  { num: "01", label: "OBSERVE" },
  { num: "02", label: "UNDERSTAND" },
  { num: "03", label: "CLASSIFY" },
  { num: "04", label: "PRIORITIZE" },
];

// ===== MATH =====
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export default function SignalTransformationSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  // Scroll → smoothed progress. The lerp gives the scrub weight, so the
  // section reads as an instrument being turned rather than slides flipping.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);

    let raf = 0;
    let target = 0;
    let current = 0;

    function measure() {
      const section = sectionRef.current;
      if (!section) return;
      const scrollable = section.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      target = clamp01(-section.getBoundingClientRect().top / scrollable);
    }

    function tick() {
      current = mq.matches ? target : lerp(current, target, 0.12);
      if (Math.abs(current - target) < 0.0002) current = target;
      setProgress(current);
      raf = requestAnimationFrame(tick);
    }

    measure();
    current = target;
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const p = progress;
  const ph = (a: number, b: number) => smoothstep(a, b, p);
  const blur = (v: number) => (reduced ? "none" : `blur(${v}px)`);

  // ===== PHASE TIMING =====
  // Windows are kept disjoint on purpose: a panel is fully gone before the
  // next one starts, otherwise two phases ghost through each other.
  const intro = ph(0.0, 0.07);          // subject fades up, centred, large
  const dock = ph(0.10, 0.20);          // subject travels up, becomes header
  const evidenceP = ph(0.20, 0.50);     // evidence cascade under the beam
  const collapse = ph(0.50, 0.58);      // evidence folds away
  const verdict = ph(0.58, 0.70);       // distribution races, argmax locks
  const lock = ph(0.68, 0.74);          // the lock beat
  const verdictExit = ph(0.76, 0.82);   // verdict clears before risk arrives
  const riskP = ph(0.82, 0.94);         // risk gauge resolves
  const outro = ph(0.93, 0.99);

  const rowP = (i: number) => clamp01((evidenceP - i * 0.18) / 0.34);
  const stageIdx = p < 0.20 ? 0 : p < 0.58 ? 1 : p < 0.80 ? 2 : 3;
  const locked = lock > 0.5;

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: "420vh" }}
      id="signal-transformation"
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#FFFFEB]">
        {/* =====================================================
            THE SUBJECT — on screen the entire time
            Centred and large at first, then docks to the top rail
            ===================================================== */}
        <div
          className="absolute inset-x-0 flex flex-col items-center px-6 pointer-events-none"
          style={{
            zIndex: 20,
            top: `${lerp(44, 14, dock)}%`,
            transform: `translateY(-50%) scale(${lerp(1, 0.52, dock)})`,
            opacity: intro * (1 - outro * 0.7),
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.2em] text-[#8A8E86] mb-5"
            style={{ fontSize: 10, opacity: 1 - dock }}
          >
            Network Intelligence // 02 — single flow record
          </div>

          <div
            className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 font-mono tabular-nums text-[#171917]"
            style={{ fontSize: "clamp(15px, 2.1vw, 30px)", letterSpacing: "-0.01em" }}
          >
            <span>{SUBJECT.src}</span>
            <span className="text-[#B0B4AC]">→</span>
            <span>{SUBJECT.dst}</span>
            <span className="text-[#8A8E86]">{SUBJECT.proto}</span>
            <span className="text-[#8A8E86]">{SUBJECT.bytes}</span>
            <span className="text-[#8A8E86]">{SUBJECT.dur}</span>
            <span
              className="transition-colors duration-700"
              style={{ color: evidenceP > 0.1 ? "#E11D48" : "#8A8E86" }}
            >
              {SUBJECT.flags}
            </span>
          </div>

          <p
            className="type-body max-w-[460px] mt-8 text-center"
            style={{ opacity: clamp01(1 - dock * 1.8) * intro }}
          >
            One record. Seventy-eight measurements. Kairo reads them the way an
            analyst would — and shows its working.
          </p>
        </div>

        {/* =====================================================
            EVIDENCE — a scan beam sweeps down, each row wakes
            ===================================================== */}
        <div
          className="absolute inset-x-0 mx-auto w-full max-w-[720px] px-6"
          style={{
            zIndex: 15,
            top: "28%",
            opacity: dock * (1 - collapse),
            transform: `translateY(${collapse * -24}px)`,
            filter: collapse > 0 ? blur(collapse * 5) : "none",
            pointerEvents: "none",
          }}
        >
          <div className="relative">
            {/* Inspection beam */}
            <div
              className="absolute inset-x-0 pointer-events-none"
              style={{
                top: `${evidenceP * 100}%`,
                opacity: evidenceP > 0.01 && evidenceP < 0.99 ? 1 : 0,
                transition: "opacity 0.4s",
              }}
            >
              <div className="h-px w-full bg-gradient-to-r from-transparent via-[#E11D48] to-transparent opacity-50" />
              <div className="h-8 w-full bg-gradient-to-b from-[#E4D4F8]/25 to-transparent" />
            </div>

            <div
              className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A8E86] pb-3 mb-4 border-b border-[#DCDDCB]"
              style={{ opacity: dock }}
            >
              Feature evidence · training-only scaler · demo values
            </div>

            {EVIDENCE.map((e, i) => {
              const t = rowP(i);
              return (
                <div
                  key={e.key}
                  className="py-3 border-b border-[#DCDDCB]/50"
                  style={{
                    opacity: t,
                    transform: `translateY(${(1 - t) * 14}px)`,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-sans text-[14px] sm:text-[15px] font-medium text-[#171917] tracking-tight">
                        {e.label}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#8A8E86] mt-0.5 truncate">
                        {e.read}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-[15px] sm:text-[17px] font-bold text-[#E11D48] shrink-0">
                      {Math.round(e.value * t)}
                      <span className="text-[10px] font-normal text-[#B0B4AC] ml-0.5">%</span>
                    </div>
                  </div>

                  {/* Deviation bar */}
                  <div className="mt-2.5 h-[3px] w-full bg-[#E8E8D8] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#E11D48]"
                      style={{ width: `${e.value * t}%` }}
                    />
                  </div>

                  <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#B0B4AC] mt-1.5">
                    {e.key}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* =====================================================
            VERDICT — the distribution races, argmax locks
            ===================================================== */}
        <div
          className="absolute inset-x-0 mx-auto w-full max-w-[640px] px-6"
          style={{
            zIndex: 16,
            top: "28%",
            opacity: verdict * (1 - verdictExit),
            transform: `translateY(${(1 - verdict) * 28 + verdictExit * -30}px)`,
            filter: verdictExit > 0 ? blur(verdictExit * 6) : "none",
            pointerEvents: "none",
          }}
        >
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A8E86] mb-6">
            Ensemble soft-voting output · demo inference
          </div>

          {CLASSES.map((c, i) => {
            const isTop = i === 0;
            const w = c.p * 100 * verdict;
            return (
              <div
                key={c.name}
                className="flex items-center gap-3 py-1.5"
                style={{ opacity: isTop ? 1 : lerp(1, 0.28, lock) }}
              >
                <div
                  className={`w-[88px] shrink-0 font-mono text-[11px] tracking-tight ${
                    isTop ? "text-[#171917] font-bold" : "text-[#8A8E86]"
                  }`}
                >
                  {c.name}
                </div>
                <div className="flex-1 h-[7px] bg-[#E8E8D8] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-colors duration-500"
                    style={{
                      width: `${w}%`,
                      backgroundColor: isTop ? "#E11D48" : "#C8C8B4",
                    }}
                  />
                </div>
                <div
                  className={`w-[52px] shrink-0 text-right font-mono tabular-nums text-[11px] ${
                    isTop ? "text-[#E11D48] font-bold" : "text-[#B0B4AC]"
                  }`}
                >
                  {(c.p * verdict).toFixed(3)}
                </div>
              </div>
            );
          })}

          {/* The lock beat */}
          <div
            className="mt-9 flex flex-col items-center"
            style={{
              opacity: lock,
              transform: `scale(${lerp(0.94, 1, lock)})`,
            }}
          >
            <div className="font-mono text-[8.5px] font-bold uppercase tracking-[0.2em] text-[#B0B4AC] mb-2">
              argmax locked
            </div>
            <h3
              className="font-serif italic text-[#E11D48] leading-none"
              style={{ fontSize: "clamp(56px, 11vw, 132px)", letterSpacing: "-0.03em" }}
            >
              DDoS
            </h3>
            <div className="font-mono text-[11px] font-bold tracking-[0.16em] text-[#E11D48]/70 uppercase mt-3">
              SYN Flood · volumetric
            </div>
          </div>

          {/* Framing brackets — drawn only once locked */}
          <div
            className="pointer-events-none absolute inset-x-6 bottom-[-14px] h-[132px] border-x border-b border-[#E11D48]/25"
            style={{ opacity: locked ? 1 : 0, transition: "opacity 0.6s" }}
          />
        </div>

        {/* =====================================================
            RISK — the score is assembled from named inputs
            ===================================================== */}
        <div
          className="absolute inset-x-0 mx-auto w-full max-w-[720px] px-6"
          style={{
            zIndex: 17,
            top: "28%",
            opacity: riskP,
            transform: `translateY(${(1 - riskP) * 34}px)`,
            pointerEvents: "none",
          }}
        >
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A8E86] mb-7">
            Risk engine · classification is not severity
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-8 sm:gap-10 items-center">
            {/* Contributing inputs */}
            <div className="sm:col-span-7 space-y-2.5">
              {RISK_INPUTS.map((r, i) => {
                const t = clamp01((riskP - i * 0.07) / 0.4);
                return (
                  <div key={r.label} className="flex items-center gap-3" style={{ opacity: t }}>
                    <div className="w-[118px] shrink-0 font-sans text-[12.5px] text-[#62665F]">
                      {r.label}
                    </div>
                    <div className="flex-1 h-[5px] bg-[#E8E8D8] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#171917]"
                        style={{ width: `${r.v * 100 * t}%` }}
                      />
                    </div>
                    <div className="w-[34px] shrink-0 text-right font-mono tabular-nums text-[10.5px] text-[#8A8E86]">
                      {(r.v * t).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* The number */}
            <div className="sm:col-span-5 flex flex-col items-start sm:items-end">
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[0.16em] text-[#B0B4AC]">
                Composite risk
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-mono font-bold text-[#E11D48] tabular-nums leading-none"
                  style={{ fontSize: "clamp(64px, 11vw, 128px)", letterSpacing: "-0.05em" }}
                >
                  {Math.round(RISK_SCORE * riskP)}
                </span>
                <span className="font-mono text-[#B0B4AC] text-[20px]">/ 100</span>
              </div>
              <div className="font-mono text-[12px] font-bold tracking-[0.2em] text-[#E11D48] uppercase mt-1">
                High
              </div>
            </div>
          </div>

          <div
            className="mt-12 pt-6 border-t border-[#DCDDCB] flex flex-wrap items-baseline justify-between gap-3"
            style={{ opacity: outro }}
          >
            <p className="font-serif italic text-[#62665F]" style={{ fontSize: "clamp(16px, 1.6vw, 22px)" }}>
              Not an alert. An argument.
            </p>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#B0B4AC]">
              Same pipeline runs on live telemetry ↓
            </span>
          </div>
        </div>

        {/* ===== STAGE INDICATOR ===== */}
        <div
          className="absolute bottom-6 sm:bottom-8 left-6 sm:left-8 flex items-center gap-3 sm:gap-5 font-mono text-[9px] sm:text-[10px] tracking-[0.1em] uppercase pointer-events-none"
          style={{
            zIndex: 30,
            opacity: p > 0.05 && p < 0.97 ? 0.7 : 0,
            transition: "opacity 0.6s",
          }}
        >
          {STAGES.map((s, i) => (
            <span
              key={s.num}
              className="transition-all duration-500"
              style={{
                color: i === stageIdx ? "#171917" : "#C8C8B4",
                fontWeight: i === stageIdx ? 700 : 400,
              }}
            >
              {s.num} {s.label}
            </span>
          ))}
        </div>

        {/* Scroll progress hairline */}
        <div
          className="absolute bottom-0 left-0 h-[2px] bg-[#E4D4F8]"
          style={{ zIndex: 30, width: `${p * 100}%` }}
        />
      </div>
    </section>
  );
}
