"use client";

import React, { useEffect, useRef, useState } from "react";
import Reveal from "@/components/common/Reveal";

/* ===========================================================================
   SECTION 04 — FROM ALERT TO UNDERSTANDING
   A sticky stage: the eight-step SOC chain from the spec (§3) on the left,
   one large case-file panel on the right that re-forms at each step. Scroll
   drives the step; nothing on screen is more than a few lines of text.
   =========================================================================== */

const STEPS = [
  "Alert",
  "Attack details",
  "Source",
  "Target",
  "Traffic characteristics",
  "Model confidence",
  "Timeline",
  "Recommended response",
];

const IMPORTANCE = [
  { f: "Packet Rate", w: 1.0 },
  { f: "Flow Bytes", w: 0.74 },
  { f: "Packet Length", w: 0.52 },
  { f: "Flow Duration", w: 0.27 },
];

const RISK_INPUTS = [
  { label: "Attack severity", note: "reconnaissance, not destruction" },
  { label: "Model confidence", note: "95% — the model is sure" },
  { label: "Traffic volume", note: "sustained, not a single probe" },
  { label: "Affected asset", note: "a router fronting the data centre" },
  { label: "Persistence", note: "still going after nine minutes" },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Big label / value pair for the case file. */
function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="flex items-baseline gap-5 py-3 border-b border-white/8">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/30 w-[92px] shrink-0">
        {k}
      </span>
      <span
        className="font-mono text-[17px] sm:text-[19px] tabular-nums"
        style={{ color: accent ?? "#FFFFEB" }}
      >
        {v}
      </span>
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-white/45 mt-7 max-w-[46ch]">
      {children}
    </p>
  );
}

export default function InvestigationSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    let raf = 0;

    function read() {
      raf = 0;
      const section = sectionRef.current;
      if (!section) return;
      const scrollable = section.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const p = clamp01(-section.getBoundingClientRect().top / scrollable);
      // hold the first and last step a little longer than the middle ones
      const idx = Math.min(
        STEPS.length - 1,
        Math.floor(clamp01((p - 0.04) / 0.9) * STEPS.length)
      );
      setStep(idx);
    }

    function onScroll() {
      if (!raf) raf = requestAnimationFrame(read);
    }

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const panels = [
    // 00 — Alert
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#FB7185]">
        Incident opened
      </div>
      <div
        className="font-mono tracking-tight text-[#FFFFEB] leading-none mt-5"
        style={{ fontSize: "clamp(44px, 6vw, 76px)" }}
      >
        KAI-2291
      </div>
      <div className="flex items-center gap-2.5 mt-6">
        <span className="h-2 w-2 rounded-full bg-[#FB7185] animate-pulse" />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#FB7185]">
          Open · raised automatically
        </span>
      </div>
      <Caption>
        A flow crossed both gates and became an incident rather than a log line
        — given an identifier and attached to the asset it touched.
      </Caption>
    </>,

    // 01 — Attack details
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        Classified as
      </div>
      <div
        className="font-serif tracking-tight text-[#FFFFEB] leading-none mt-4"
        style={{ fontSize: "clamp(64px, 9vw, 118px)" }}
      >
        DDoS
      </div>
      <div className="mt-5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded border border-[#FB7185]/40 text-[#FB7185]">
          Critical
        </span>
      </div>
      <Caption>
        Named, not described. The class comes from the second gate and carries
        its own probability distribution — which is what makes the confidence
        figure meaningful later.
      </Caption>
    </>,

    // 02 — Source
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        Where it came from
      </div>
      <div className="mt-6 max-w-[440px]">
        <Row k="Address" v="10.20.14.52" accent="#FB7185" />
        <Row k="Seen at" v="Router-02" />
        <Row k="First seen" v="10:32:14" />
      </div>
      <Caption>
        An address on its own is trivia. Kairo resolves it to the sensor that
        observed it, so you know which part of the estate is involved.
      </Caption>
    </>,

    // 03 — Target
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        What it reached
      </div>
      <div className="font-mono text-[13px] sm:text-[15px] text-white/70 mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-white/35">Demo Org</span>
        <span className="text-white/20">→</span>
        <span className="text-white/35">Bangalore</span>
        <span className="text-white/20">→</span>
        <span className="text-white/35">10.20.1.0/24</span>
        <span className="text-white/20">→</span>
        <span className="text-[#FFFFEB] border-b border-[#FB7185] pb-0.5">
          Router-02
        </span>
      </div>
      <div
        className="font-mono tracking-tight text-[#FFFFEB] leading-none mt-8"
        style={{ fontSize: "clamp(34px, 4.6vw, 58px)" }}
      >
        10.20.1.10
      </div>
      <Caption>
        Organization, office, network, sensor. One deployment spans many
        offices, so every incident has to say where it lives.
      </Caption>
    </>,

    // 04 — Traffic characteristics
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        Why the model said so
      </div>
      <div className="mt-8 space-y-5 max-w-[500px]">
        {IMPORTANCE.map((r, i) => (
          <div key={r.f}>
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-sans text-[14px] text-white/75">{r.f}</span>
              <span className="font-mono text-[11px] tabular-nums text-white/30">
                {r.w.toFixed(2)}
              </span>
            </div>
            <div className="h-[3px] bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#FB7185] transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: step >= 4 ? `${r.w * 100}%` : "0%",
                  transitionDelay: `${i * 110}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <Caption>
        Feature importance for the decision that was actually made — not a
        global chart about the model in general.
      </Caption>
    </>,

    // 05 — Model confidence
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        How sure the model is
      </div>
      <div className="flex items-baseline gap-3 mt-4">
        <span
          className="font-mono font-bold tabular-nums text-[#FFFFEB] leading-none"
          style={{ fontSize: "clamp(72px, 11vw, 150px)", letterSpacing: "-0.05em" }}
        >
          98.7
        </span>
        <span className="font-mono text-white/30 text-[24px]">%</span>
      </div>
      <Caption>
        The ensemble&rsquo;s probability for the winning class. It is a
        statement about the model — not about how much trouble you are in.
      </Caption>
    </>,

    // 06 — Timeline
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        How long it has been going
      </div>
      <div className="mt-8 max-w-[500px]">
        <div className="relative h-[2px] bg-white/10 rounded-full">
          <div className="absolute inset-y-0 left-0 w-[64%] bg-[#FBBF24] rounded-full" />
          <span className="absolute left-0 -top-1 h-2.5 w-2.5 rounded-full bg-[#FBBF24] -translate-x-1/2" />
          <span className="absolute left-[64%] -top-1 h-2.5 w-2.5 rounded-full bg-[#FBBF24] -translate-x-1/2 animate-pulse" />
        </div>
        <div className="flex justify-between mt-4 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="text-white/45">10:32:14 detected</span>
          <span className="text-[#FBBF24]">ongoing</span>
        </div>
      </div>
      <div
        className="font-mono tracking-tight text-[#FFFFEB] leading-none mt-9"
        style={{ fontSize: "clamp(40px, 5.5vw, 70px)" }}
      >
        2m 31s
      </div>
      <Caption>
        An attack running for two and a half minutes is a different problem from
        one that fired once and stopped. Persistence feeds the risk score.
      </Caption>
    </>,

    // 07 — Recommended response
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        What to do about it
      </div>
      <div className="mt-7 space-y-3 max-w-[460px]">
        {[
          "Rate-limit 10.20.14.52 at Router-02",
          "Hold the flow for review",
          "Notify the Bangalore network owner",
        ].map((a, i) => (
          <div
            key={a}
            className="flex items-center gap-4 py-3.5 px-5 rounded-xl bg-white/[0.04] border border-white/8"
          >
            <span className="font-mono text-[10px] tabular-nums text-white/25">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-sans text-[14.5px] text-white/85">{a}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 inline-flex items-center gap-2.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35 border border-white/12 rounded-full px-3.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#FBBF24]" />
        Response engine · designed, not enabled
      </div>
      <Caption>
        Kairo proposes; it does not act. A system that can cut traffic by itself
        has to earn that right with measured false-positive rates first.
      </Caption>
    </>,
  ];

  return (
    <section
      id="investigation"
      ref={sectionRef}
      className="relative bg-[#FFFFEB]"
      style={{ height: `${STEPS.length * 62 + 60}vh` }}
    >
      {/* sticky stage */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col">
        {/* heading band */}
        <div className="mx-auto w-full max-w-[1180px] px-6 sm:px-10 pt-24 sm:pt-28 pb-6 shrink-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <h2
              className="font-serif tracking-tight leading-[0.95] text-[#171917]"
              style={{ fontSize: "clamp(30px, 4vw, 54px)" }}
            >
              Most tools hand you a red row.
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8E86]">
              Investigation // 04
            </span>
          </div>
        </div>

        {/* the stage */}
        <div className="mx-auto w-full max-w-[1180px] px-6 sm:px-10 pb-10 flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 h-full">
            {/* step rail */}
            <div className="hidden lg:flex lg:col-span-4 flex-col justify-center">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#B0B4AC] pb-4 mb-3 border-b border-[#DCDDCB]">
                Incident KAI-2291
              </div>
              <ol>
                {STEPS.map((s, i) => {
                  const on = i === step;
                  const passed = i < step;
                  return (
                    <li key={s} className="flex items-center gap-3.5 py-[7px]">
                      <span
                        className="h-px transition-all duration-500 shrink-0"
                        style={{
                          width: on ? 30 : 12,
                          backgroundColor: on
                            ? "#E11D48"
                            : passed
                            ? "#8A8E86"
                            : "#DCDDCB",
                        }}
                      />
                      <span
                        className="font-mono text-[12px] tracking-tight transition-all duration-500"
                        style={{
                          color: on ? "#171917" : passed ? "#8A8E86" : "#C8C8B4",
                          fontWeight: on ? 700 : 400,
                        }}
                      >
                        {s}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* case file */}
            <div className="lg:col-span-8 h-full min-h-0">
              <div className="relative h-full rounded-2xl overflow-hidden bg-[#0B0E0D] border border-[#0B0E0D] shadow-[0_40px_90px_-30px_rgba(23,25,23,0.5)]">
                {/* chrome */}
                <div className="flex items-center gap-4 px-6 sm:px-9 py-4 border-b border-white/8 shrink-0">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                    Case file
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
                    KAI-2291
                  </span>
                  <span className="ml-auto font-mono text-[9px] tabular-nums text-white/25">
                    {String(step + 1).padStart(2, "0")} / 08
                  </span>
                </div>

                {/* panels crossfade in place */}
                <div className="relative flex-1 h-[calc(100%-53px)]">
                  {panels.map((p, i) => (
                    <div
                      key={i}
                      aria-hidden={i !== step}
                      className="absolute inset-0 px-6 sm:px-9 py-8 sm:py-10 flex flex-col justify-center overflow-hidden"
                      style={{
                        opacity: i === step ? 1 : 0,
                        transform:
                          i === step
                            ? "none"
                            : `translateY(${i < step ? -14 : 14}px)`,
                        transition:
                          "opacity 620ms var(--ease-cinematic), transform 620ms var(--ease-cinematic)",
                        pointerEvents: i === step ? "auto" : "none",
                      }}
                    >
                      {p}
                    </div>
                  ))}
                </div>

                {/* progress hairline */}
                <div className="absolute left-0 right-0 bottom-0 h-px bg-white/8">
                  <div
                    className="h-full bg-[#FB7185] transition-[width] duration-500 ease-out"
                    style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
