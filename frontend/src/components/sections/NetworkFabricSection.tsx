"use client";

import React, { useState } from "react";
import Reveal from "@/components/common/Reveal";

/* ===========================================================================
   SECTION 06 — ONE INTELLIGENCE LAYER. EVERY NETWORK.
   One picture carries the claim: every device in every office empties into a
   single core. Sites are filterable, so the fabric can be read one office at
   a time instead of as eight lines at once.
   =========================================================================== */

const CORE_X = 900;
const CORE_Y = 300;
const RAIL_X = 200;

type Office = {
  id: string;
  name: string;
  net: string;
  accent: string;
  devices: { name: string; y: number }[];
};

/** Mirrors the Test Lab in section 05 — same estate, seen from above. */
const OFFICES: Office[] = [
  {
    id: "bbsr",
    name: "Bhubaneswar Office",
    net: "10.20.3.0/24",
    accent: "#6EE7B7",
    devices: [
      { name: "Router-01", y: 76 },
      { name: "Router-02", y: 138 },
      { name: "Firewall-01", y: 200 },
    ],
  },
  {
    id: "blr",
    name: "Bangalore Office",
    net: "10.20.1.0/24",
    accent: "#E4D4F8",
    devices: [
      { name: "Router-01", y: 288 },
      { name: "Firewall-01", y: 350 },
    ],
  },
  {
    id: "bom",
    name: "Mumbai DC",
    net: "10.20.7.0/24",
    accent: "#FBBF24",
    devices: [
      { name: "Router-01", y: 438 },
      { name: "Firewall-01", y: 500 },
    ],
  },
];

const OUTPUTS = ["class + confidence", "risk score", "incident context"];

/** Every sensor takes the same shape of journey, so one curve generates all. */
const curve = (y: number) =>
  `M ${RAIL_X} ${y} C 470 ${y} 600 ${CORE_Y} ${CORE_X - 92} ${CORE_Y}`;

const HIERARCHY = ["Organization", "Office", "Network", "Sensor"];

export default function NetworkFabricSection() {
  const [focus, setFocus] = useState<string | null>(null);
  const shown = (id: string) => !focus || focus === id;

  return (
    <section id="platform" className="relative bg-[#FFFFEB]">
      {/* ================= ACT 1 — SHORT WORDS ================= */}
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-28 sm:pt-40 pb-14 sm:pb-20">
        <Reveal>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8E86]">
            Architecture // 06
          </div>
        </Reveal>
        <Reveal delay={90}>
          <h2
            className="font-serif tracking-tight leading-[0.94] mt-7 text-[#171917]"
            style={{ fontSize: "clamp(46px, 8vw, 104px)" }}
          >
            One intelligence layer.
            <br />
            <em className="font-normal italic">Every network.</em>
          </h2>
        </Reveal>
        <Reveal delay={180}>
          <p className="type-body mt-9 max-w-[46ch]">
            An organization is never one network. Kairo watches every office
            from a single brain — so a pattern learned in Mumbai is already
            understood in Bhubaneswar.
          </p>
        </Reveal>
      </div>

      {/* ================= ACT 2 — THE FABRIC ================= */}
      <Reveal>
        <div className="w-full bg-[#0B0E0D] text-[#FFFFEB]">
          {/* chrome */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 sm:px-10 py-4 border-b border-white/8">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
              Kairo fabric
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
              Demo Org · 3 sites
            </span>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-white/30 border border-white/12 rounded-full px-2.5 py-1">
              illustrative topology · the Test Lab estate
            </span>
          </div>

          {/* site filter */}
          <div className="px-6 sm:px-10 pt-8 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 mr-2">
              Isolate
            </span>
            {[{ id: null, name: "All sites", accent: "#FFFFEB" }, ...OFFICES].map(
              (o) => {
                const on = focus === o.id;
                return (
                  <button
                    key={o.id ?? "all"}
                    type="button"
                    onClick={() => setFocus(o.id)}
                    className="font-mono text-[10.5px] px-3 py-1.5 rounded-full cursor-pointer transition-colors duration-200 border"
                    style={{
                      color: on ? "#171917" : "rgba(255,255,255,0.45)",
                      backgroundColor: on ? o.accent : "transparent",
                      borderColor: on ? o.accent : "rgba(255,255,255,0.12)",
                    }}
                  >
                    {o.name}
                  </button>
                );
              }
            )}
          </div>

          {/* the picture — scrolls sideways on small screens rather than
              shrinking its labels into illegibility */}
          <div className="overflow-x-auto px-6 sm:px-10 py-6">
            <svg
              viewBox="0 0 1280 600"
              className="w-full min-w-[940px] h-auto"
              role="img"
              aria-label="Eight sensors across three offices converging on one Kairo core"
            >
              {OFFICES.map((o) => {
                const on = shown(o.id);
                const first = o.devices[0].y;
                const last = o.devices[o.devices.length - 1].y;
                return (
                  <g
                    key={o.id}
                    style={{
                      opacity: on ? 1 : 0.12,
                      transition: "opacity 600ms var(--ease-cinematic)",
                    }}
                  >
                    {/* site header */}
                    <text
                      x={0}
                      y={first - 34}
                      className="font-mono"
                      fontSize={11}
                      letterSpacing="1.6"
                      fill={o.accent}
                      style={{ textTransform: "uppercase" }}
                    >
                      {o.name.toUpperCase()}
                    </text>
                    <text
                      x={0}
                      y={first - 18}
                      className="font-mono"
                      fontSize={10}
                      fill="rgba(255,255,255,0.28)"
                    >
                      {o.net}
                    </text>

                    {/* the site bus */}
                    <line
                      x1={RAIL_X - 4}
                      y1={first}
                      x2={RAIL_X - 4}
                      y2={last}
                      stroke={o.accent}
                      strokeOpacity={0.5}
                      strokeWidth={1}
                    />

                    {o.devices.map((d, i) => (
                      <g key={d.name}>
                        <text
                          x={RAIL_X - 20}
                          y={d.y + 4}
                          textAnchor="end"
                          className="font-mono"
                          fontSize={12}
                          fill="rgba(255,255,255,0.62)"
                        >
                          {d.name}
                        </text>
                        <circle
                          cx={RAIL_X - 4}
                          cy={d.y}
                          r={3.5}
                          fill={o.accent}
                        />

                        {/* the route, then a short dash travelling it */}
                        <path
                          d={curve(d.y)}
                          fill="none"
                          stroke="rgba(255,255,255,0.13)"
                          strokeWidth={1}
                        />
                        <path
                          className="fabric-pulse"
                          d={curve(d.y)}
                          fill="none"
                          stroke={o.accent}
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          pathLength={100}
                          strokeDasharray="2.5 97.5"
                          style={{ animationDelay: `${(i * 0.7 + o.id.length * 0.31) % 2.8}s` }}
                        />
                      </g>
                    ))}
                  </g>
                );
              })}

              {/* ---- the core ---- */}
              <circle
                cx={CORE_X}
                cy={CORE_Y}
                r={86}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeDasharray="2 8"
              />
              <circle
                cx={CORE_X}
                cy={CORE_Y}
                r={70}
                fill="none"
                stroke="rgba(255,255,255,0.16)"
                className="animate-pulse"
              />
              <circle cx={CORE_X} cy={CORE_Y} r={56} fill="#FFFFEB" />
              <text
                x={CORE_X}
                y={CORE_Y - 2}
                textAnchor="middle"
                className="font-mono"
                fontSize={13}
                fontWeight={700}
                letterSpacing="2"
                fill="#171917"
              >
                KAIRO
              </text>
              <text
                x={CORE_X}
                y={CORE_Y + 16}
                textAnchor="middle"
                className="font-mono"
                fontSize={9}
                letterSpacing="1.2"
                fill="#62665F"
              >
                ONE MODEL
              </text>

              {/* ---- what leaves the core ---- */}
              {OUTPUTS.map((label, i) => {
                const y = CORE_Y - 48 + i * 48;
                return (
                  <g key={label}>
                    <path
                      d={`M ${CORE_X + 58} ${CORE_Y} C ${CORE_X + 84} ${CORE_Y} ${CORE_X + 84} ${y} ${CORE_X + 110} ${y}`}
                      fill="none"
                      stroke="rgba(255,255,255,0.16)"
                      strokeWidth={1}
                    />
                    <text
                      x={CORE_X + 122}
                      y={y + 4}
                      className="font-mono"
                      fontSize={11.5}
                      fill="rgba(255,255,255,0.55)"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* tally */}
          <div className="border-t border-white/8 px-6 sm:px-10 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              ["3", "offices"],
              [String(OFFICES.reduce((n, o) => n + o.devices.length, 0)), "sensors"],
              ["1", "model"],
              ["1", "verdict format"],
            ].map(([n, l]) => (
              <div key={l}>
                <div className="font-mono tabular-nums leading-none text-[#FFFFEB] text-[34px] sm:text-[42px]">
                  {n}
                </div>
                <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/30 mt-2">
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ================= ACT 3 — WHY IT IS SHAPED THIS WAY ================= */}
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10">
        <Reveal delay={80}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-12 py-14 sm:py-20 border-b border-[#DCDDCB]">
            <p className="md:col-span-5 font-serif italic text-[22px] sm:text-[27px] leading-snug tracking-tight text-[#171917]">
              Every incident knows where it lives.
            </p>
            <div className="md:col-span-7">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {HIERARCHY.map((h, i) => (
                  <React.Fragment key={h}>
                    <span className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-[#171917] border border-[#DCDDCB] rounded-full px-3 py-1.5">
                      {h}
                    </span>
                    {i < HIERARCHY.length - 1 && (
                      <span className="text-[#B0B4AC]">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <p className="type-body-sm leading-relaxed max-w-[62ch] mt-6">
                Four levels, always populated. It is the difference between
                &ldquo;something attacked 10.20.1.10&rdquo; and &ldquo;the
                router fronting the Bangalore data centre is absorbing an HTTP
                flood&rdquo; — and it is why one deployment can cover an estate
                without the alerts turning into noise.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="py-14 sm:py-20 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {[
              [
                "Sensors stay thin",
                "A small agent measures flows and forwards the numbers. It holds no model, no thresholds and no state — so adding a site is a registration, not a rollout.",
              ],
              [
                "The core stays single",
                "One model, one feature pipeline, one risk engine. Two brains would mean two answers for the same traffic.",
              ],
              [
                "Context travels with the flow",
                "Office, network and sensor are attached at the edge, so the verdict arrives already knowing which asset it concerns.",
              ],
            ].map(([h, b]) => (
              <div key={h}>
                <div className="h-px w-10 bg-[#171917] mb-5" />
                <h4 className="font-serif tracking-tight text-[22px] sm:text-[25px] leading-snug text-[#171917]">
                  {h}
                </h4>
                <p className="type-body-sm leading-relaxed mt-3.5">{b}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
