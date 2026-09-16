"use client";

import React from "react";
import { CRITICAL_AT, type Detection } from "@/lib/demo";

export const sevColour = (d: Detection) =>
  d.risk >= CRITICAL_AT ? "#E11D48" : d.risk >= 70 ? "#D97706" : "#059669";

export const clock = (at: number) =>
  new Date(at).toLocaleTimeString("en-GB", { hour12: false });

/** Dense by design. Whitespace between bands, density inside them. */
export default function DetectionTable({
  detections,
  onSelect,
  compact = false,
  selectedId,
}: {
  detections: Detection[];
  onSelect: (d: Detection) => void;
  compact?: boolean;
  selectedId?: string | null;
}) {
  if (detections.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-serif text-[20px] text-[#62665F]">Nothing has been flagged here.</p>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[#DCDDCB] text-left">
          {["Time", "Attack", "Source → Target", ...(compact ? [] : ["Office", "Sensor"]), "Conf.", "Risk", ...(compact ? [] : ["Status"])].map(
            (h) => (
              <th
                key={h}
                className="py-2.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#8A8E86] font-normal whitespace-nowrap"
              >
                {h}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {detections.map((d) => (
          <tr
            key={d.id}
            onClick={() => onSelect(d)}
            className={`group border-b border-[#E8E8D8] cursor-pointer transition-colors duration-150 ${
              selectedId === d.id ? "bg-[#F4F2E2]" : "hover:bg-[#FAF8ED]"
            }`}
          >
            <td className="py-3 font-mono text-[11px] text-[#62665F] tabular-nums whitespace-nowrap">
              {clock(d.at)}
            </td>
            <td className="py-3 pr-4">
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: sevColour(d) }}
                />
                <span className="font-sans text-[13.5px] font-medium">{d.attack}</span>
              </span>
            </td>
            <td className="py-3 pr-4 font-mono text-[11px] text-[#62665F] tabular-nums whitespace-nowrap">
              {d.source} <span className="text-[#C9CBBE]">→</span> {d.target}
            </td>
            {!compact && (
              <>
                <td className="py-3 pr-4 text-[13px] text-[#62665F] whitespace-nowrap">{d.office}</td>
                <td className="py-3 pr-4 font-mono text-[11px] text-[#8A8E86] whitespace-nowrap">
                  {d.sensor}
                </td>
              </>
            )}
            <td className="py-3 pr-4 font-mono text-[11px] tabular-nums text-[#62665F] whitespace-nowrap">
              {(d.confidence * 100).toFixed(1)}%
            </td>
            <td className="py-3 pr-4 whitespace-nowrap">
              <span
                className="font-serif text-[19px] tabular-nums"
                style={{ color: sevColour(d) }}
              >
                {d.risk}
              </span>
            </td>
            {!compact && (
              <td className="py-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#8A8E86] whitespace-nowrap">
                {d.status.replace("-", " ")}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
