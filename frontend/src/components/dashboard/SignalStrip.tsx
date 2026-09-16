"use client";

import React, { useEffect, useRef } from "react";

/**
 * Ambient flow volume. Low green pulse while nothing is wrong; a detection
 * punches a vertical mark through it. Canvas rather than SVG because it runs
 * continuously — no framer-motion, no GSAP, consistent with the landing page.
 */
export default function SignalStrip({
  landed,
  severity = "critical",
  height = 96,
}: {
  landed: string | null;
  severity?: "normal" | "warning" | "critical";
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // marks scroll leftward with the wave; each is an x offset in "age" pixels
  const marks = useRef<{ age: number; colour: string }[]>([]);

  useEffect(() => {
    if (!landed) return;
    marks.current.push({
      age: 0,
      colour:
        severity === "critical" ? "#FB7185" : severity === "warning" ? "#FBBF24" : "#16DFA0",
    });
  }, [landed, severity]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const mid = h * 0.62;

      // baseline
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      // the wave: three incommensurate sines so it never visibly repeats
      ctx.strokeStyle = "#16DFA0";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const p = (x + t) * 0.014;
        const a =
          Math.sin(p) * 7 + Math.sin(p * 2.37 + 1.1) * 4 + Math.sin(p * 0.61 + 2.4) * 5;
        const y = mid - a;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // detection marks travel left and fade
      marks.current = marks.current.filter((m) => m.age < w + 40);
      for (const m of marks.current) {
        m.age += 1.1;
        const x = w - 60 - m.age;
        if (x < -20) continue;
        const fade = Math.max(0, 1 - m.age / (w * 0.9));
        ctx.globalAlpha = fade;
        ctx.strokeStyle = m.colour;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, mid - h * 0.42);
        ctx.lineTo(x, mid + h * 0.22);
        ctx.stroke();
        ctx.fillStyle = m.colour;
        ctx.beginPath();
        ctx.arc(x, mid - h * 0.42, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      t += 1.1;
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} style={{ height }} className="w-full block" />;
}
