import React from "react";

export type SignalState = "normal" | "warning" | "critical" | "observing";

interface StateSignalProps {
  state: SignalState;
  label?: string;
  className?: string;
}

export default function StateSignal({
  state,
  label,
  className = "",
}: StateSignalProps) {
  const config = {
    normal: {
      color: "bg-[#059669]",
      text: "text-[#059669]",
      border: "border-[#059669]/20",
      bg: "bg-[#059669]/5",
      defaultLabel: "HEALTHY",
    },
    warning: {
      color: "bg-[#D97706]",
      text: "text-[#D97706]",
      border: "border-[#D97706]/20",
      bg: "bg-[#D97706]/5",
      defaultLabel: "WARNING",
    },
    critical: {
      color: "bg-[#E11D48]",
      text: "text-[#E11D48]",
      border: "border-[#E11D48]/20",
      bg: "bg-[#E11D48]/5",
      defaultLabel: "CRITICAL",
    },
    observing: {
      color: "bg-[#8A8E86]",
      text: "text-[#62665F]",
      border: "border-[#DCDDCB]",
      bg: "bg-transparent",
      defaultLabel: "OBSERVING",
    },
  };

  const item = config[state];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${item.border} ${item.bg} font-mono text-[11px] uppercase tracking-wider font-medium ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
      <span className={item.text}>{label || item.defaultLabel}</span>
    </span>
  );
}
