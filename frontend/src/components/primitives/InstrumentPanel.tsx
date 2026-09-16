import React from "react";

interface InstrumentPanelProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerMeta?: React.ReactNode;
  className?: string;
}

/**
 * Technical High-Density Instrument Surface
 * Represents precision machine telemetry embedded into the editorial paper environment.
 */
export default function InstrumentPanel({
  children,
  headerTitle,
  headerMeta,
  className = "",
}: InstrumentPanelProps) {
  return (
    <div
      className={`rounded-2xl sm:rounded-3xl bg-[#111413] text-white border border-white/[0.08] shadow-[0_16px_36px_-6px_rgba(17,20,19,0.16),0_4px_12px_-2px_rgba(17,20,19,0.08)] overflow-hidden ${className}`}
    >
      {headerTitle && (
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between font-mono text-xs text-[#8A8E86]">
          <span className="font-semibold text-white tracking-wider uppercase">
            {headerTitle}
          </span>
          {headerMeta && <div>{headerMeta}</div>}
        </div>
      )}
      <div className="p-6 sm:p-8">{children}</div>
    </div>
  );
}
