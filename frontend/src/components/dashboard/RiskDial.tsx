"use client";

import React from "react";
import { CRITICAL_AT } from "@/lib/demo";

const R = 78;
const CX = 100;
const CY = 104;
const ARC = Math.PI * R; // half-circle path length

export const riskColor = (v: number) =>
  v >= CRITICAL_AT ? "#FB7185" : v >= 60 ? "#FBBF24" : "#16DFA0";

/**
 * The one instrument that must not just appear — it seeks. A risk score that
 * fades in reads as a statistic; a needle that travels reads as a machine
 * that changed its mind.
 */
export default function RiskDial({ value, label }: { value: number; label?: string }) {
  const c = riskColor(value);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 130" className="w-full max-w-[240px]" aria-label={`Risk ${value}`}>
        {/* ticks, every 10 — the paper-instrument tell */}
        {Array.from({ length: 11 }, (_, i) => {
          const a = Math.PI - (i / 10) * Math.PI;
          const inner = i % 5 === 0 ? R - 13 : R - 7;
          return (
            <line
              key={i}
              x1={CX + Math.cos(a) * (R + 4)}
              y1={CY - Math.sin(a) * (R + 4)}
              x2={CX + Math.cos(a) * inner}
              y2={CY - Math.sin(a) * inner}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={i % 5 === 0 ? 1.2 : 0.7}
            />
          );
        })}

        <path
          d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <path
          d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke={c}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={ARC}
          strokeDashoffset={ARC * (1 - value / 100)}
          style={{
            transition: "stroke-dashoffset 900ms var(--ease-cinematic), stroke 900ms linear",
          }}
        />

        <g
          style={{
            transform: `rotate(${-90 + (value / 100) * 180}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: "transform 900ms var(--ease-cinematic)",
          }}
        >
          {/* a blade in the outer ring, not a full needle — it would cross the
              numeral at most values */}
          <line x1={CX} y1={CY - 40} x2={CX} y2={CY - R + 14} stroke={c} strokeWidth={1.8} />
        </g>
        <circle cx={CX} cy={CY} r={3} fill={c} />

        <text
          x={CX}
          y={CY - 24}
          textAnchor="middle"
          className="font-serif"
          fill="#FFFFFF"
          fontSize={44}
          style={{ letterSpacing: "-0.02em" }}
        >
          {value}
        </text>
        <text
          x={CX}
          y={CY + 20}
          textAnchor="middle"
          className="font-mono"
          fill="#8A8E86"
          fontSize={9}
          letterSpacing="2"
        >
          {(label ?? (value >= CRITICAL_AT ? "CRITICAL" : value >= 60 ? "ELEVATED" : "STABLE"))}
        </text>
      </svg>
    </div>
  );
}
