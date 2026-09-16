"use client";

import React from "react";

interface DecisionApertureProps {
  x: number;
  y: number;
  isProcessing?: boolean;
  scenario?: string;
}

/**
 * Kairo Analytical Decision Core
 * A proprietary convergent analytical prism — not a radar target.
 * Communicates: FLOW → BEHAVIOR → DECISION
 * Uses intersecting vector trajectories, segmented hexagonal frame,
 * and directional flow indicators on a light warm canvas.
 */
export default function DecisionAperture({
  x,
  y,
  isProcessing = true,
  scenario = "NORMAL",
}: DecisionApertureProps) {
  const isThreat = scenario !== "NORMAL";
  const accentColor =
    scenario === "DDOS" || scenario === "BRUTEFORCE" || scenario === "BOTNET"
      ? "#E11D48"
      : scenario === "PORTSCAN"
      ? "#D97706"
      : "#059669";

  const tintFill = isThreat
    ? scenario === "PORTSCAN"
      ? "#FFF8EC"
      : "#FFF5F5"
    : "#F0FDF7";

  const decisionLabel =
    scenario === "NORMAL"
      ? "NOMINAL"
      : scenario === "DDOS"
      ? "ANOMALY"
      : scenario === "PORTSCAN"
      ? "RECON"
      : scenario === "BRUTEFORCE"
      ? "AUTH SPIKE"
      : "C2 BEACON";

  return (
    <g transform={`translate(${x}, ${y})`} className="select-none pointer-events-none">
      <defs>
        {/* Soft warm ambient glow */}
        <filter id="aperture-ambient" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="12" result="ambient" />
          <feMerge>
            <feMergeNode in="ambient" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Crisp accent shadow */}
        <filter id="aperture-elevation" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#171917" floodOpacity="0.08" />
        </filter>
        {/* Radial gradient for the core disc */}
        <radialGradient id="core-gradient" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F5F5E8" />
        </radialGradient>
      </defs>

      {/* 1. Ambient Analytical Field (Warm Luminous Halo) */}
      <circle r="52" fill={tintFill} opacity="0.6" filter="url(#aperture-ambient)" />

      {/* 2. Converging Vector Trajectory Guidelines */}
      {/* These communicate FLOW convergence, NOT radar */}
      <line x1="-65" y1="-35" x2="-20" y2="-10" stroke={accentColor} strokeWidth="1.25" strokeOpacity="0.4" strokeDasharray="2 3" />
      <line x1="-65" y1="35" x2="-20" y2="10" stroke={accentColor} strokeWidth="1.25" strokeOpacity="0.4" strokeDasharray="2 3" />
      <line x1="20" y1="-10" x2="65" y2="-35" stroke={accentColor} strokeWidth="1.25" strokeOpacity="0.35" strokeDasharray="2 3" />
      <line x1="20" y1="10" x2="65" y2="35" stroke={accentColor} strokeWidth="1.25" strokeOpacity="0.35" strokeDasharray="2 3" />

      {/* 3. Directional Flow Chevrons (In from left, Out to right) */}
      <path d="M -50,0 L -38,-6 M -50,0 L -38,6" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <path d="M 38,-6 L 50,0 M 38,6 L 50,0" fill="none" stroke={isThreat ? accentColor : "#059669"} strokeWidth="2" strokeLinecap="round" opacity="0.7" />

      {/* 4. Analytical Decision Frame (Hexagonal Prism — NOT a circle) */}
      <polygon
        points="-30,-16 -16,-30 16,-30 30,-16 30,16 16,30 -16,30 -30,16"
        fill={tintFill}
        stroke="#171917"
        strokeWidth="1.75"
        filter="url(#aperture-elevation)"
      />

      {/* Precision Corner Caliper Marks */}
      <line x1="-30" y1="-16" x2="-24" y2="-16" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="30" y1="-16" x2="24" y2="-16" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="-30" y1="16" x2="-24" y2="16" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="30" y1="16" x2="24" y2="16" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="-16" y1="-30" x2="-16" y2="-24" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="-30" x2="16" y2="-24" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />

      {/* 5. Central Decision Disc with Gradient */}
      <circle r="16" fill="url(#core-gradient)" stroke={accentColor} strokeWidth="2" />

      {/* Inner Behavioral Indicator Dot */}
      <circle r="5.5" fill={accentColor}>
        {isProcessing && (
          <animate
            attributeName="r"
            values="5;6.5;5"
            dur="2.4s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* 6. Subtle Decision State Ring (Breathing, Not Radar) */}
      {isProcessing && isThreat && (
        <polygon
          points="-36,-20 -20,-36 20,-36 36,-20 36,20 20,36 -20,36 -36,20"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.25"
          strokeOpacity="0.5"
        >
          <animate
            attributeName="stroke-opacity"
            values="0.5;0.15;0.5"
            dur="2.2s"
            repeatCount="indefinite"
          />
        </polygon>
      )}

      {/* 7. Decision Classification Label */}
      <g transform="translate(0, 58)">
        <rect
          x="-50"
          y="-11"
          width="100"
          height="22"
          rx="5"
          fill="#FFFFFF"
          stroke={accentColor}
          strokeWidth="1.25"
          filter="url(#aperture-elevation)"
        />
        <text
          x="0"
          y="3"
          textAnchor="middle"
          fill={accentColor}
          fontSize="9.5"
          fontFamily="monospace"
          fontWeight="bold"
          letterSpacing="0.06em"
        >
          {decisionLabel}
        </text>
      </g>
    </g>
  );
}
