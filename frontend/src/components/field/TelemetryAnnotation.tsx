"use client";

import React from "react";
import { TelemetryAnnotationData } from "./types";

interface TelemetryAnnotationProps {
  annotation: TelemetryAnnotationData;
}

export default function TelemetryAnnotation({ annotation }: TelemetryAnnotationProps) {
  if (!annotation.visible) return null;

  const stateColors = {
    normal: { text: "text-[#059669]", border: "border-[#059669]/30", dot: "bg-[#059669]" },
    warning: { text: "text-[#D97706]", border: "border-[#D97706]/30", dot: "bg-[#D97706]" },
    critical: { text: "text-[#E11D48]", border: "border-[#E11D48]/30", dot: "bg-[#E11D48]" },
  };

  const style = stateColors[annotation.state || "normal"];

  return (
    <div
      style={{ left: `${annotation.x}px`, top: `${annotation.y}px` }}
      className="absolute pointer-events-none select-none -translate-x-1/2 -translate-y-full pb-2 transition-all duration-300 animate-in fade-in"
    >
      <div
        className={`px-2.5 py-1 rounded-md bg-[#111413] text-white border border-white/10 shadow-sm font-mono text-[10px] space-y-0.5`}
      >
        <div className="flex items-center gap-1.5 text-[#8A8E86] text-[9px] uppercase tracking-wider">
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          <span>{annotation.title}</span>
        </div>
        <div className={`font-semibold tracking-wide ${style.text}`}>
          {annotation.value}
        </div>
      </div>
      {/* Tiny vertical hairline connector */}
      <div className="w-px h-2 bg-[#171917]/20 mx-auto" />
    </div>
  );
}
