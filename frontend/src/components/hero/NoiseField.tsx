"use client";

import React, { useEffect, useRef, useState } from "react";

const COLS = 68;
const ROWS = 30;
const GLYPHS = ">&+;:|<%=/*?!$#@_^.~\\-]{}()0123456789abcdef";

// Adaline resamples ~12% of its glyphs every ~120ms (~50% of the field per
// second). Same rate here, so the field reads as live telemetry, not wallpaper.
const TICK_MS = 110;
const CHURN = Math.round(ROWS * COLS * 0.12);

/** Deterministic so the server and client render the same first frame. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The legible telemetry that "resolves" out of the noise. Row/col are grid
// cells, so each token drops into the <pre> flow and needs no positioning.
const TOKENS = [
  { row: 4, col: 5, text: "SYN 10.20.14.52 -> 10.20.1.10", tone: "ink", delay: 1.1 },
  { row: 9, col: 34, text: "flow_bytes/s 9.4e5", tone: "ink", delay: 1.5 },
  { row: 14, col: 3, text: "dst_port 22 x418", tone: "ink", delay: 1.9 },
  { row: 19, col: 40, text: "iat_sigma 0.004", tone: "mute", delay: 2.3 },
  { row: 24, col: 6, text: "DDoS / SYN Flood  conf 0.987", tone: "hot", delay: 2.7 },
];

const TONE = {
  ink: "text-[#171917]",
  mute: "text-[#62665F]",
  hot: "text-[#E11D48]",
} as const;

const ROW_TEXT = (() => {
  const rnd = mulberry32(1337);
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () =>
      rnd() < 0.14 ? " " : GLYPHS[Math.floor(rnd() * GLYPHS.length)]
    ).join("")
  );
})();

// The grid is wider than the column on purpose, so the right edge dissolves
// instead of being cut off mid-glyph at whatever width the viewport is.
const EDGE_FADE = "linear-gradient(to right, #000 70%, transparent 100%)";

export default function NoiseField({ className = "" }: { className?: string }) {
  const [rows, setRows] = useState<string[]>(ROW_TEXT);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cells = ROW_TEXT.map((r) => r.split(""));
    let live = true;
    const io = new IntersectionObserver(
      ([e]) => {
        live = e.isIntersecting;
      },
      { rootMargin: "120px" }
    );
    if (hostRef.current) io.observe(hostRef.current);

    const id = setInterval(() => {
      if (!live) return;
      for (let i = 0; i < CHURN; i++) {
        const r = (Math.random() * ROWS) | 0;
        const c = (Math.random() * COLS) | 0;
        cells[r][c] =
          Math.random() < 0.14
            ? " "
            : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setRows(cells.map((r) => r.join("")));
    }, TICK_MS);

    return () => {
      io.disconnect();
      clearInterval(id);
    };
  }, []);

  const grid = rows.map((row, r) => {
    const t = TOKENS.find((x) => x.row === r);
    return (
      <React.Fragment key={r}>
        {t ? (
          <>
            {row.slice(0, t.col)}
            <span
              className={`${TONE[t.tone as keyof typeof TONE]} font-semibold`}
              style={{
                animation: `cinematicFade 1.2s var(--ease-cinematic) ${t.delay}s both`,
              }}
            >
              {t.text}
            </span>
            {row.slice(t.col + t.text.length)}
          </>
        ) : (
          row
        )}
        {"\n"}
      </React.Fragment>
    );
  });

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={`relative select-none overflow-hidden ${className}`}
      style={{ fontSize: "clamp(8px, 0.95vw, 13px)" }}
    >
      <div
        className="relative"
        style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
      >
        <pre className="font-mono text-[#8A8E86]/35 m-0" style={{ lineHeight: 1.15 }}>
          {grid}
        </pre>

        {/* Same grid, inked in — a masked band sweeps down and "reads" it. */}
        <pre
          className="hero-sweep absolute inset-0 m-0 font-mono text-[#171917]/90"
          style={{ lineHeight: 1.15 }}
        >
          {grid}
        </pre>
      </div>
    </div>
  );
}
