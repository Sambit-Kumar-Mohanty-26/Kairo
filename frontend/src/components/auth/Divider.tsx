import React from "react";

export default function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 my-0">
      <span className="h-px flex-1 bg-[#DCDDCB]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8E86]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[#DCDDCB]" />
    </div>
  );
}
