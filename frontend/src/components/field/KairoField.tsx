"use client";

import React from "react";
import NetworkCanvas from "./NetworkCanvas";
import { ScenarioType } from "./types";

interface KairoFieldProps {
  scenario: ScenarioType;
  onScenarioChange?: (scenario: ScenarioType) => void;
  className?: string;
}

const SCENARIOS = [
  { id: "NORMAL", label: "Normal" },
  { id: "DDOS", label: "DDoS" },
  { id: "PORTSCAN", label: "Port Scan" },
  { id: "BRUTEFORCE", label: "Brute Force" },
  { id: "BOTNET", label: "Botnet" },
] as const;

const ACCENT = {
  normal: "#34D399",
  warning: "#FBBF24",
  critical: "#FB7185",
} as const;

export default function KairoField({
  scenario,
  onScenarioChange,
  className = "",
}: KairoFieldProps) {
  // Coherent scenario taxonomy with truthful demo values
  const scenarioTaxonomy = {
    NORMAL: {
      attackClass: "Normal Traffic",
      subtype: "Baseline Ingress",
      source: "Corporate Fabric (10.20.0.0/16)",
      evidence1: "Handshake symmetry 94%",
      evidence2: "Payload entropy 0.78",
      riskScore: 12,
      riskLevel: "LOW",
      severity: "normal",
      status: "NOMINAL FLOW",
    },
    DDOS: {
      attackClass: "DDoS",
      subtype: "SYN Flood",
      source: "Replay Source (10.20.14.52)",
      evidence1: "Forward packet rate 98% anomalous",
      evidence2: "SYN/ACK asymmetry 92%",
      riskScore: 91,
      riskLevel: "HIGH",
      severity: "critical",
      status: "VOLUMETRIC ANOMALY",
    },
    PORTSCAN: {
      attackClass: "Port Scan",
      subtype: "SYN Sweep",
      source: "Branch Sensor Host (10.20.1.1)",
      evidence1: "Destination port variance 91%",
      evidence2: "Inter-arrival jitter 82%",
      riskScore: 78,
      riskLevel: "HIGH",
      severity: "warning",
      status: "RECONNAISSANCE SWEEP",
    },
    BRUTEFORCE: {
      attackClass: "Brute Force",
      subtype: "SSH Credential Stuffing",
      source: "Replay Adversary (172.16.4.19)",
      evidence1: "Failed auth frequency 89%",
      evidence2: "Burst cycle regularity 76%",
      riskScore: 84,
      riskLevel: "HIGH",
      severity: "critical",
      status: "AUTH SPIKE ISOLATED",
    },
    BOTNET: {
      attackClass: "Botnet",
      subtype: "Coordinated C2 Beaconing",
      source: "Distributed Sensor Nodes",
      evidence1: "Multi-host synchronization 94%",
      evidence2: "Beacon periodicity 86%",
      riskScore: 89,
      riskLevel: "HIGH",
      severity: "critical",
      status: "C2 CLUSTER CORRELATED",
    },
  };

  const active = scenarioTaxonomy[scenario];
  const accent = ACCENT[active.severity as keyof typeof ACCENT];

  return (
    <div
      className={`w-full rounded-2xl bg-[#0B0E0D] overflow-hidden flex flex-col shadow-[0_40px_80px_-24px_rgba(23,25,23,0.45),0_8px_24px_-8px_rgba(23,25,23,0.2)] ${className}`}
    >
      {/* ===== 1. INSTRUMENT HEADER ===== */}
      <div className="px-4 sm:px-5 py-3 border-b border-white/8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ backgroundColor: accent }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: accent }}
            />
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#FFFFEB]">
            Flow replay
          </span>
        </div>

        {/* Scenario selector */}
        <div className="flex flex-wrap items-center gap-1">
          {SCENARIOS.map((item) => {
            const on = scenario === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onScenarioChange?.(item.id)}
                className="px-2.5 py-1 rounded-full font-mono text-[10px] cursor-pointer transition-colors duration-300"
                style={{
                  backgroundColor: on ? "#E4D4F8" : "transparent",
                  color: on ? "#171917" : "rgba(255,255,255,0.4)",
                  fontWeight: on ? 700 : 400,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== 2. LIVING TOPOLOGY ===== */}
      <div className="relative w-full h-[320px] sm:h-[400px] lg:h-[430px] overflow-hidden">
        <NetworkCanvas scenario={scenario} />
      </div>

      {/* ===== 3. VERDICT ===== */}
      <div className="px-4 sm:px-5 py-4 border-t border-white/8 flex items-end justify-between gap-5">
        <div className="min-w-0">
          <div
            className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            {active.status}
          </div>

          <div className="flex items-baseline gap-2.5 mt-1.5">
            <h2
              className="font-serif tracking-tight leading-none text-[#FFFFEB]"
              style={{ fontSize: "clamp(22px, 2.6vw, 30px)" }}
            >
              {active.attackClass}
            </h2>
            <span className="font-mono text-[10px] text-white/30 truncate">
              // {active.subtype}
            </span>
          </div>

          <div className="font-mono text-[9.5px] text-white/35 mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{active.evidence1}</span>
            <span className="text-white/15">·</span>
            <span>{active.evidence2}</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono text-[8.5px] font-bold uppercase tracking-[0.16em] text-white/30">
            Demo risk
          </div>
          <div className="flex items-baseline gap-1 justify-end">
            <span
              className="font-mono font-bold tabular-nums leading-none"
              style={{
                fontSize: "clamp(40px, 5.2vw, 62px)",
                letterSpacing: "-0.04em",
                color: accent,
              }}
            >
              {active.riskScore}
            </span>
            <span className="font-mono text-white/20 text-[12px]">/100</span>
          </div>
          <div
            className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase"
            style={{ color: accent }}
          >
            {active.riskLevel}
          </div>
        </div>
      </div>
    </div>
  );
}
