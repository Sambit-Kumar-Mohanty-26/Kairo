"use client";

import React from "react";
import { ScenarioType } from "./types";

interface ScenarioSelectorProps {
  current: ScenarioType;
  onChange: (scenario: ScenarioType) => void;
  className?: string;
}

const SCENARIOS: { id: ScenarioType; label: string; tag: string }[] = [
  { id: "NORMAL", label: "Normal", tag: "BASELINE" },
  { id: "DDOS", label: "DDoS", tag: "INUNDATION" },
  { id: "PORTSCAN", label: "Port Scan", tag: "PROBE" },
  { id: "BRUTEFORCE", label: "Brute Force", tag: "AUTH" },
  { id: "BOTNET", label: "Botnet", tag: "C2" },
];

export default function ScenarioSelector({
  current,
  onChange,
  className = "",
}: ScenarioSelectorProps) {
  return (
    <div
      className={`inline-flex items-center gap-1 p-1 rounded-full bg-[#FFFFEB] border border-[#DCDDCB] shadow-[0_2px_8px_-2px_rgba(23,25,23,0.05)] ${className}`}
      role="tablist"
      aria-label="Kairo Network Scenario Selector"
    >
      <div className="hidden sm:flex items-center pl-3 pr-2 text-[#8A8E86] font-mono text-[10px] uppercase tracking-widest font-semibold border-r border-[#DCDDCB]/80 mr-1">
        Vectors
      </div>

      {SCENARIOS.map((item) => {
        const isSelected = current === item.id;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(item.id)}
            className={`relative px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-sans font-medium tracking-tight transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
              isSelected
                ? "bg-[#E4D4F8] text-[#171917] font-semibold border border-[#171917] shadow-xs"
                : "text-[#62665F] hover:text-[#171917] hover:bg-[#FAF8ED] border border-transparent"
            }`}
          >
            {/* Active Indicator Dot */}
            <span
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isSelected
                  ? item.id === "NORMAL"
                    ? "bg-[#059669]"
                    : "bg-[#E11D48]"
                  : "bg-[#DCDDCB]"
              }`}
            />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
