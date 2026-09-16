"use client";

import React from "react";
import type { Detection } from "@/lib/demo";

/* The chain from section 10: Internet → Firewall → Core Router → the office's
   own sources, with the server hanging off the same router. Drawn rather than
   imported — a diagram library for six nodes and five lines is the whole
   reason bundles get heavy. */

const COL = [64, 208, 356] as const;
const LEAF_X = 560;
const ROW = 58;

export type TopologyProps = {
  /** the office's sources, in Settings order */
  sources: string[];
  /** newest unresolved detection in this office, or null */
  hot: Detection | null;
};

export default function Topology({ sources, hot }: TopologyProps) {
  const leaves = [...sources, "Server"];
  const h = Math.max(168, leaves.length * ROW + 44);
  const mid = h / 2;
  const top = mid - ((leaves.length - 1) * ROW) / 2;

  // The compromised node is the one the detection actually arrived on. If the
  // source has since been deleted the alert still shows, just not on a node.
  const hotName = hot?.sensor ?? null;
  const tone = hot ? (hot.severity === "critical" ? "#FB7185" : "#FBBF24") : "#16DFA0";

  return (
    <svg
      viewBox={`0 0 700 ${h}`}
      className="w-full h-auto"
      role="img"
      aria-label="Network topology"
    >
      {/* trunk */}
      <Edge x1={COL[0] + 30} y1={mid} x2={COL[1] - 30} y2={mid} live={!!hot} tone={tone} />
      <Edge x1={COL[1] + 34} y1={mid} x2={COL[2] - 34} y2={mid} live={!!hot} tone={tone} />

      {leaves.map((name, i) => {
        const y = top + i * ROW;
        const isHot = name === hotName;
        return (
          <g key={name}>
            <path
              /* a fan of curves, not elbows — stacked right angles draw a box
                 the eye reads as a node that is not there */
              d={`M ${COL[2] + 34} ${mid} C ${COL[2] + 110} ${mid}, ${LEAF_X - 90} ${y}, ${LEAF_X - 10} ${y}`}
              fill="none"
              stroke={isHot ? tone : "rgba(255,255,255,0.14)"}
              strokeWidth={isHot ? 1.4 : 1}
              strokeDasharray={isHot ? "5 6" : undefined}
              style={isHot ? { animation: "kFlow 1.1s linear infinite" } : undefined}
            />
            <Node x={LEAF_X} y={y} label={name} tone={isHot ? tone : undefined} anchor="start" />
          </g>
        );
      })}

      <Node x={COL[0]} y={mid} label="Internet" />
      <Node x={COL[1]} y={mid} label="Firewall" />
      <Node x={COL[2]} y={mid} label="Core Router" />

      <style>{`@keyframes kFlow { to { stroke-dashoffset: -22px } }`}</style>
    </svg>
  );
}

function Edge({
  x1,
  y1,
  x2,
  y2,
  live,
  tone,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  live: boolean;
  tone: string;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={live ? tone : "rgba(255,255,255,0.14)"}
      strokeWidth={live ? 1.4 : 1}
      strokeDasharray={live ? "5 6" : undefined}
      style={live ? { animation: "kFlow 1.1s linear infinite" } : undefined}
    />
  );
}

function Node({
  x,
  y,
  label,
  tone,
  anchor = "middle",
}: {
  x: number;
  y: number;
  label: string;
  tone?: string;
  anchor?: "middle" | "start";
}) {
  const c = tone ?? "rgba(255,255,255,0.55)";
  return (
    <g>
      {tone && (
        <circle cx={x} cy={y} r={9} fill={tone} opacity={0.18}>
          <animate attributeName="r" values="9;19;9" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.24;0;0.24" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={x} cy={y} r={5} fill={tone ? tone : "#111413"} stroke={c} strokeWidth={1.2} />
      <text
        x={anchor === "start" ? x + 14 : x}
        y={anchor === "start" ? y + 4 : y + 26}
        textAnchor={anchor}
        className="font-mono"
        fontSize={10.5}
        letterSpacing="0.08em"
        fill={tone ?? "rgba(255,255,255,0.72)"}
      >
        {label}
      </text>
    </g>
  );
}
