"use client";

import React, { useEffect, useRef, useState } from "react";

/* ===========================================================================
   CLASSIFICATION CANVAS
   Flows enter from the left as unlabeled grey. Gate 01 splits them into
   Normal (released downward) and Malicious (escalated). Gate 02 fans the
   malicious ones into six named lanes, and the lane counters tick up.

   This is the two-stage cascade from the spec, running rather than described.
   =========================================================================== */

const LANES = [
  "DDoS",
  "DoS",
  "Port Scan",
  "Brute Force",
  "Botnet",
  "Web Attack",
];

// Roughly the class balance of the training data: mostly benign, and the
// attack classes are far from even. The imbalance is the point.
const LANE_WEIGHTS = [0.3, 0.19, 0.22, 0.13, 0.09, 0.07];
const MALICIOUS_RATE = 0.34;

const INK = "#0B0E0D";
const GREY = [138, 142, 134] as const;
const EMERALD = [52, 211, 153] as const;
const ROSE = [251, 113, 133] as const;

const X_IN = -0.03;
const X_GATE1 = 0.3;
const X_GATE2 = 0.55;
const X_BIN = 0.855;

type Pt = { x: number; y: number };

interface Flow {
  pts: Pt[];       // normalized waypoints
  segLen: number[];// normalized length of each segment
  total: number;
  s: number;       // distance travelled
  speed: number;
  lane: number;    // -1 = benign
  r: number;
  trail: Pt[];
}

function buildFlow(): Flow {
  const malicious = Math.random() < MALICIOUS_RATE;
  const yIn = 0.1 + Math.random() * 0.8;

  let lane = -1;
  const pts: Pt[] = [
    { x: X_IN, y: yIn },
    { x: X_GATE1, y: 0.5 + (yIn - 0.5) * 0.25 },
  ];

  if (!malicious) {
    // released: peels away downward and leaves the frame
    pts.push({ x: X_GATE1 + 0.12, y: 0.78 + Math.random() * 0.1 });
    pts.push({ x: 0.5, y: 1.12 });
  } else {
    let acc = 0;
    const roll = Math.random();
    lane = LANE_WEIGHTS.length - 1;
    for (let i = 0; i < LANE_WEIGHTS.length; i++) {
      acc += LANE_WEIGHTS[i];
      if (roll < acc) {
        lane = i;
        break;
      }
    }
    const laneY = (lane + 0.5) / LANES.length;
    pts.push({ x: X_GATE2, y: 0.5 + (laneY - 0.5) * 0.35 });
    pts.push({ x: X_GATE2 + 0.14, y: laneY });
    pts.push({ x: X_BIN, y: laneY });
  }

  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = (pts[i + 1].y - pts[i].y) * 0.5; // y is visually compressed
    const l = Math.hypot(dx, dy);
    segLen.push(l);
    total += l;
  }

  return {
    pts,
    segLen,
    total,
    s: 0,
    speed: 0.1 + Math.random() * 0.06,
    lane,
    r: 1.5 + Math.random() * 1.4,
    trail: [],
  };
}

function at(f: Flow, s: number): Pt {
  let rem = s;
  for (let i = 0; i < f.segLen.length; i++) {
    if (rem <= f.segLen[i]) {
      const t = f.segLen[i] === 0 ? 0 : rem / f.segLen[i];
      // ease within the segment so corners read as curves, not kinks
      const e = t * t * (3 - 2 * t);
      return {
        x: f.pts[i].x + (f.pts[i + 1].x - f.pts[i].x) * e,
        y: f.pts[i].y + (f.pts[i + 1].y - f.pts[i].y) * e,
      };
    }
    rem -= f.segLen[i];
  }
  return f.pts[f.pts.length - 1];
}

export default function ClassificationCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const [counts, setCounts] = useState<number[]>(() => LANES.map(() => 0));
  const [released, setReleased] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const cvs = cvsRef.current;
    if (!wrap || !cvs) return;

    const ctx = cvs.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    function resize() {
      const r = wrap!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      cvs!.width = w * dpr;
      cvs!.height = h * dpr;
      cvs!.style.width = `${w}px`;
      cvs!.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Pause entirely when scrolled away — this runs at 60fps otherwise.
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
      threshold: 0.05,
    });
    io.observe(wrap);

    const flows: Flow[] = [];
    // A pool of "landed" pulses so bins visibly absorb something.
    const pulses: { lane: number; life: number }[] = [];
    const tally = LANES.map(() => 0);
    let rel = 0;
    let dirty = false;

    // seed so the field is never empty on first paint
    for (let i = 0; i < 70; i++) {
      const f = buildFlow();
      f.s = Math.random() * f.total;
      flows.push(f);
    }

    let raf = 0;
    let last = 0;
    let spawnAcc = 0;
    let sync = 0;

    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
      last = ts;
      if (!visible) return;

      // --- spawn ---
      spawnAcc += dt;
      const interval = reduced ? 0.2 : 0.045;
      while (spawnAcc > interval) {
        spawnAcc -= interval;
        if (flows.length < 260) flows.push(buildFlow());
      }

      ctx.clearRect(0, 0, w, h);

      // --- gate rules ---
      const laneH = h / LANES.length;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < LANES.length; i++) {
        ctx.beginPath();
        ctx.moveTo(X_GATE2 * w, i * laneH);
        ctx.lineTo(w, i * laneH);
        ctx.stroke();
      }
      ctx.restore();

      for (const gx of [X_GATE1, X_GATE2]) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(228,212,248,0)");
        g.addColorStop(0.5, "rgba(228,212,248,0.42)");
        g.addColorStop(1, "rgba(228,212,248,0)");
        ctx.fillStyle = g;
        ctx.fillRect(gx * w - 0.75, 0, 1.5, h);
      }

      // --- flows ---
      for (let i = flows.length - 1; i >= 0; i--) {
        const f = flows[i];
        f.s += f.speed * dt;

        if (f.s >= f.total) {
          if (f.lane >= 0) {
            tally[f.lane]++;
            pulses.push({ lane: f.lane, life: 1 });
          } else {
            rel++;
          }
          dirty = true;
          flows.splice(i, 1);
          continue;
        }

        const p = at(f, f.s);
        const px = p.x * w;
        const py = p.y * h;

        // colour is decided at gate 01, not at spawn
        const passed1 = p.x > X_GATE1;
        const col = !passed1 ? GREY : f.lane >= 0 ? ROSE : EMERALD;
        const alpha = !passed1 ? 0.42 : 0.9;

        // short comet trail
        f.trail.push({ x: px, y: py });
        if (f.trail.length > 9) f.trail.shift();
        for (let k = 0; k < f.trail.length - 1; k++) {
          const q = k / (f.trail.length - 1);
          ctx.beginPath();
          ctx.moveTo(f.trail[k].x, f.trail[k].y);
          ctx.lineTo(f.trail[k + 1].x, f.trail[k + 1].y);
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${q * alpha * 0.4})`;
          ctx.lineWidth = f.r * 1.5 * q;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(px, py, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
        ctx.fill();
      }

      // --- bins ---
      for (let i = 0; i < LANES.length; i++) {
        const y = (i + 0.5) * laneH;
        ctx.beginPath();
        ctx.arc(X_BIN * w, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(251,113,133,0.55)";
        ctx.fill();
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pu = pulses[i];
        pu.life -= dt * 2.2;
        if (pu.life <= 0) {
          pulses.splice(i, 1);
          continue;
        }
        const y = (pu.lane + 0.5) * laneH;
        ctx.beginPath();
        ctx.arc(X_BIN * w, y, 3 + (1 - pu.life) * 16, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251,113,133,${pu.life * 0.5})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // push counters to React at ~5Hz, not every frame
      sync += dt;
      if (sync > 0.2 && dirty) {
        sync = 0;
        dirty = false;
        setCounts([...tally]);
        setReleased(rel);
      }
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const totalMal = counts.reduce((a, b) => a + b, 0);

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-[440px] sm:h-[560px] lg:h-[640px]"
      style={{ backgroundColor: INK }}
    >
      <canvas ref={cvsRef} className="absolute inset-0" />

      {/* gate captions */}
      <div
        className="absolute top-0 bottom-0 flex flex-col justify-start pt-6 -translate-x-1/2 pointer-events-none"
        style={{ left: "30%" }}
      >
        <div className="text-center">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#E4D4F8]">
            Gate 01
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35 mt-1">
            malicious?
          </div>
        </div>
      </div>
      <div
        className="absolute top-0 bottom-0 flex flex-col justify-start pt-6 -translate-x-1/2 pointer-events-none"
        style={{ left: "55%" }}
      >
        <div className="text-center">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#E4D4F8]">
            Gate 02
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35 mt-1">
            which attack?
          </div>
        </div>
      </div>

      {/* ingress caption */}
      <div className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30 [writing-mode:vertical-rl] rotate-180">
          raw flows · unlabeled
        </div>
      </div>

      {/* released counter — parked left of the benign exit stream so the
          numerals never sit on top of the particles */}
      <div
        className="absolute pointer-events-none text-right -translate-x-full"
        style={{ left: "30%", bottom: "13%" }}
      >
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#34D399]/70">
          released
        </div>
        <div className="font-mono text-[15px] tabular-nums text-[#34D399] mt-0.5">
          {released.toLocaleString()}
        </div>
      </div>

      {/* lane readout */}
      <div className="absolute right-3 sm:right-6 top-0 bottom-0 flex flex-col justify-around pointer-events-none">
        {LANES.map((l, i) => (
          <div key={l} className="text-right">
            <div className="font-mono text-[10px] sm:text-[11px] text-white/80 tracking-tight">
              {l}
            </div>
            <div className="font-mono text-[13px] sm:text-[15px] tabular-nums text-[#FB7185] leading-tight">
              {counts[i].toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* footer strip */}
      <div className="absolute left-0 right-0 bottom-0 flex flex-wrap items-center gap-x-5 gap-y-1 px-4 sm:px-8 py-3 border-t border-white/8 bg-black/30 backdrop-blur-sm font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
        <span className="text-white/55">Two-stage cascade</span>
        <span>{(released + totalMal).toLocaleString()} flows observed</span>
        <span className="hidden sm:inline">
          {totalMal.toLocaleString()} escalated
        </span>
        <span className="ml-auto">illustrative motion · not live telemetry</span>
      </div>
    </div>
  );
}
