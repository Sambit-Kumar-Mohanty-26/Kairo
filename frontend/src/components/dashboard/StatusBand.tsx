"use client";

import React, { useEffect, useRef, useState } from "react";

/** Counts travel to their new value rather than swapping to it. */
export function Odometer({ value, className = "" }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      // ease-out cubic, the numeric twin of --ease-cinematic
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (b - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={`tabular-nums ${className}`}>{shown.toLocaleString("en-US")}</span>;
}

/* §8's four figures. One ruled band, not four cards — cards are the generic
   dashboard tell, and these numbers belong on the same instrument face. */
export default function StatusBand({
  items,
}: {
  items: { label: string; value: number; tone?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#DCDDCB] border-y border-[#DCDDCB]">
      {items.map((it) => (
        <div key={it.label} className="px-6 sm:px-8 py-7 first:pl-0 sm:first:pl-0">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
            {it.label}
          </div>
          <div
            className="font-serif text-[40px] sm:text-[46px] leading-none tracking-tight mt-3"
            style={{ color: it.tone ?? "#171917", transition: "color 900ms linear" }}
          >
            <Odometer value={it.value} />
          </div>
        </div>
      ))}
    </div>
  );
}
