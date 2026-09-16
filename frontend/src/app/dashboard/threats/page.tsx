"use client";

import React, { useMemo, useState } from "react";
import { useConsole } from "@/components/dashboard/DemoProvider";
import DetectionTable from "@/components/dashboard/DetectionTable";
import DetailPane from "@/components/dashboard/DetailPane";
import { CRITICAL_AT, SCENARIOS, type Detection, type Scenario } from "@/lib/demo";

type Sev = "all" | "critical" | "high" | "low";

export default function ThreatsPage() {
  const { detections, setStatus } = useConsole();
  const [selected, setSelected] = useState<Detection | null>(null);
  const [attack, setAttack] = useState<Scenario | "all">("all");
  const [sev, setSev] = useState<Sev>("all");
  const [minConf, setMinConf] = useState(0);

  const rows = useMemo(
    () =>
      detections.filter((d) => {
        if (attack !== "all" && d.attack !== attack) return false;
        if (sev === "critical" && d.risk < CRITICAL_AT) return false;
        if (sev === "high" && (d.risk < 70 || d.risk >= CRITICAL_AT)) return false;
        if (sev === "low" && d.risk >= 70) return false;
        return d.confidence * 100 >= minConf;
      }),
    [detections, attack, sev, minConf],
  );

  return (
    <div className="px-6 sm:px-10 pb-24">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // 02 — Threats
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          Every verdict, in order.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[52ch]">
          One row per classified flow window. Open a row to see what the model weighed.
        </p>
      </header>

      {/* filters, on a ruled band */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-5 border-y border-[#DCDDCB]">
        <Filter label="Attack">
          <Pill active={attack === "all"} onClick={() => setAttack("all")}>
            All
          </Pill>
          {SCENARIOS.filter((s) => s !== "Normal").map((s) => (
            <Pill key={s} active={attack === s} onClick={() => setAttack(s)}>
              {s}
            </Pill>
          ))}
        </Filter>

        <Filter label="Severity">
          {(["all", "critical", "high", "low"] as Sev[]).map((s) => (
            <Pill key={s} active={sev === s} onClick={() => setSev(s)}>
              {s}
            </Pill>
          ))}
        </Filter>

        <Filter label={`Confidence ≥ ${minConf}%`}>
          <input
            type="range"
            min={0}
            max={99}
            value={minConf}
            onChange={(e) => setMinConf(Number(e.target.value))}
            className="w-[120px] accent-[#171917]"
          />
        </Filter>

        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8E86]">
          {rows.length} of {detections.length}
        </span>
      </div>

      <div className="mt-8 overflow-x-auto">
        <DetectionTable
          detections={rows}
          onSelect={setSelected}
          selectedId={selected?.id ?? null}
        />
      </div>

      <DetailPane detection={selected} onClose={() => setSelected(null)} onStatus={setStatus} />
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#8A8E86] whitespace-nowrap">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.12em] border transition-all duration-200 ${
        active
          ? "bg-[#171917] text-[#FFFFEB] border-[#171917]"
          : "border-[#DCDDCB] text-[#62665F] hover:border-[#171917] hover:text-[#171917]"
      }`}
    >
      {children}
    </button>
  );
}
