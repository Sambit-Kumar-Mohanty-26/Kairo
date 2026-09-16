"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { ScenarioType } from "./types";

/* ===========================================================================
   NETWORK CANVAS
   The instrument is a dark surface, not a diagram on paper. Everything that
   used to be a white UI card is now light on black, drawn additively so a
   flood actually looks like a flood.
   =========================================================================== */

// ===== COLOR CONSTANTS (tuned for an ink background) =====
const EMERALD: [number, number, number] = [52, 211, 153];
const CRIMSON: [number, number, number] = [251, 113, 133];
const AMBER: [number, number, number] = [251, 191, 36];

const EMERALD_HEX = "#34D399";
const CRIMSON_HEX = "#FB7185";
const AMBER_HEX = "#FBBF24";

const BG_COLOR = "#0B0E0D";

// ===== NODE DEFINITIONS (Normalized 0–1) =====
// dy lifts a label clear of the conduit leaving that node, so traffic never
// runs straight through the type.
const NODES = [
  { id: "edge-gw", x: 0.11, y: 0.25, dy: -30, label: "EDGE-GW01", sub: "10.20.14.1 · GATEWAY" },
  { id: "blr-probe", x: 0.11, y: 0.75, dy: 24, label: "BLR-PROBE", sub: "10.20.1.1 · SENSOR" },
  { id: "app-srv", x: 0.89, y: 0.19, dy: 0, label: "APP SERVER", sub: "10.20.1.100:443" },
  // path 4 arrives dead horizontal, so this label has to sit above the beam
  { id: "ssh", x: 0.89, y: 0.5, dy: -26, label: "SSH BASTION", sub: "10.20.2.15:22" },
  { id: "db", x: 0.89, y: 0.81, dy: 0, label: "CORE DB", sub: "10.0.0.12:5432" },
];

const APERTURE = { x: 0.5, y: 0.5 };

// ===== BEZIER PATH DEFINITIONS =====
interface BezierPath {
  x0: number; y0: number; cx0: number; cy0: number;
  cx1: number; cy1: number; x1: number; y1: number;
}

const PATHS: BezierPath[] = [
  // 0: WAN ingress → edge-gw
  { x0: -0.04, y0: 0.25, cx0: 0.0, cy0: 0.25, cx1: 0.06, cy1: 0.25, x1: 0.11, y1: 0.25 },
  // 1: edge-gw → aperture
  { x0: 0.11, y0: 0.25, cx0: 0.26, cy0: 0.27, cx1: 0.38, cy1: 0.4, x1: 0.5, y1: 0.5 },
  // 2: blr-probe → aperture
  { x0: 0.11, y0: 0.75, cx0: 0.26, cy0: 0.73, cx1: 0.38, cy1: 0.6, x1: 0.5, y1: 0.5 },
  // 3: aperture → app-server
  { x0: 0.5, y0: 0.5, cx0: 0.62, cy0: 0.4, cx1: 0.74, cy1: 0.27, x1: 0.89, y1: 0.19 },
  // 4: aperture → ssh-bastion
  { x0: 0.5, y0: 0.5, cx0: 0.6, cy0: 0.5, cx1: 0.74, cy1: 0.5, x1: 0.89, y1: 0.5 },
  // 5: aperture → core-db
  { x0: 0.5, y0: 0.5, cx0: 0.62, cy0: 0.6, cx1: 0.74, cy1: 0.73, x1: 0.89, y1: 0.81 },
];

// ===== HELPERS =====
function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function getPoint(path: BezierPath, t: number, w: number, h: number) {
  return {
    x: cubicBezier(t, path.x0 * w, path.cx0 * w, path.cx1 * w, path.x1 * w),
    y: cubicBezier(t, path.y0 * h, path.cy0 * h, path.cy1 * h, path.y1 * h),
  };
}

// ===== PARTICLE TYPES =====
interface Particle {
  t: number;
  speed: number;
  size: number;
  color: [number, number, number];
  trail: { x: number; y: number }[];
  trailLen: number;
  pathIdx: number;
}

interface PathParticleConfig {
  pathIdx: number;
  count: number;
  speed: number;
  size: number;
  color: [number, number, number];
  trailLen: number;
}

// ===== SCENARIO CONFIGS =====
// Counts are deliberately lopsided: an attack should visibly overwhelm the
// baseline traffic rather than politely sit beside it.
function getScenarioParticles(sc: ScenarioType): PathParticleConfig[] {
  switch (sc) {
    case "NORMAL":
      return [
        { pathIdx: 1, count: 4, speed: 0.34, size: 2.6, color: EMERALD, trailLen: 20 },
        { pathIdx: 2, count: 3, speed: 0.31, size: 2.6, color: EMERALD, trailLen: 20 },
        { pathIdx: 3, count: 3, speed: 0.37, size: 2.2, color: EMERALD, trailLen: 16 },
        { pathIdx: 4, count: 2, speed: 0.35, size: 2.2, color: EMERALD, trailLen: 16 },
        { pathIdx: 5, count: 3, speed: 0.33, size: 2.2, color: EMERALD, trailLen: 16 },
      ];
    case "DDOS":
      return [
        { pathIdx: 0, count: 11, speed: 1.9, size: 2.4, color: CRIMSON, trailLen: 24 },
        { pathIdx: 1, count: 18, speed: 1.15, size: 2.5, color: CRIMSON, trailLen: 26 },
        { pathIdx: 3, count: 1, speed: 0.37, size: 2.0, color: EMERALD, trailLen: 14 },
        { pathIdx: 5, count: 1, speed: 0.33, size: 2.0, color: EMERALD, trailLen: 14 },
      ];
    case "PORTSCAN":
      return [
        { pathIdx: 2, count: 10, speed: 0.6, size: 2.6, color: AMBER, trailLen: 22 },
        { pathIdx: 3, count: 8, speed: 0.75, size: 2.3, color: AMBER, trailLen: 20 },
        { pathIdx: 4, count: 8, speed: 0.7, size: 2.3, color: AMBER, trailLen: 20 },
        { pathIdx: 5, count: 8, speed: 0.65, size: 2.3, color: AMBER, trailLen: 20 },
      ];
    case "BRUTEFORCE":
      return [
        { pathIdx: 1, count: 2, speed: 0.34, size: 2.2, color: EMERALD, trailLen: 16 },
        { pathIdx: 4, count: 14, speed: 1.25, size: 2.5, color: CRIMSON, trailLen: 24 },
        { pathIdx: 3, count: 1, speed: 0.37, size: 2.0, color: EMERALD, trailLen: 14 },
        { pathIdx: 5, count: 1, speed: 0.33, size: 2.0, color: EMERALD, trailLen: 14 },
      ];
    case "BOTNET":
      return [
        { pathIdx: 1, count: 9, speed: 0.55, size: 2.4, color: CRIMSON, trailLen: 22 },
        { pathIdx: 2, count: 9, speed: 0.55, size: 2.4, color: CRIMSON, trailLen: 22 },
        { pathIdx: 3, count: 2, speed: 0.37, size: 2.0, color: EMERALD, trailLen: 14 },
        { pathIdx: 5, count: 2, speed: 0.33, size: 2.0, color: EMERALD, trailLen: 14 },
      ];
  }
}

function isHotPath(pathIdx: number, sc: ScenarioType): boolean {
  if (sc === "DDOS") return pathIdx === 0 || pathIdx === 1;
  if (sc === "PORTSCAN") return pathIdx >= 2;
  if (sc === "BRUTEFORCE") return pathIdx === 4;
  if (sc === "BOTNET") return pathIdx === 1 || pathIdx === 2;
  return false;
}

function getNodeColor(nodeId: string, sc: ScenarioType): string {
  if (sc === "DDOS" && nodeId === "edge-gw") return CRIMSON_HEX;
  if (sc === "PORTSCAN" && nodeId === "blr-probe") return AMBER_HEX;
  if (sc === "BRUTEFORCE" && nodeId === "ssh") return CRIMSON_HEX;
  if (sc === "BOTNET" && (nodeId === "edge-gw" || nodeId === "blr-probe"))
    return CRIMSON_HEX;
  return EMERALD_HEX;
}

function getAccent(sc: ScenarioType): { hex: string; rgb: [number, number, number] } {
  if (sc === "DDOS" || sc === "BRUTEFORCE" || sc === "BOTNET")
    return { hex: CRIMSON_HEX, rgb: CRIMSON };
  if (sc === "PORTSCAN") return { hex: AMBER_HEX, rgb: AMBER };
  return { hex: EMERALD_HEX, rgb: EMERALD };
}

function getDecisionLabel(sc: ScenarioType): string {
  if (sc === "NORMAL") return "NOMINAL";
  if (sc === "DDOS") return "ANOMALY";
  if (sc === "PORTSCAN") return "RECON";
  if (sc === "BRUTEFORCE") return "AUTH SPIKE";
  return "C2 BEACON";
}

// ===== COMPONENT =====
interface NetworkCanvasProps {
  scenario: ScenarioType;
}

export default function NetworkCanvas({ scenario }: NetworkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const initParticles = useCallback((sc: ScenarioType) => {
    const configs = getScenarioParticles(sc);
    const particles: Particle[] = [];
    for (const cfg of configs) {
      for (let i = 0; i < cfg.count; i++) {
        particles.push({
          t: i / cfg.count + Math.random() * 0.05,
          speed: cfg.speed + (Math.random() - 0.5) * cfg.speed * 0.2,
          size: cfg.size,
          color: cfg.color,
          trail: [],
          trailLen: cfg.trailLen,
          pathIdx: cfg.pathIdx,
        });
      }
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    initParticles(scenario);
  }, [scenario, initParticles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: false })!;
    let running = true;

    function resize() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    function drawFrame(timestamp: number) {
      if (!running || !canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dt = lastFrameRef.current
        ? Math.min((timestamp - lastFrameRef.current) / 1000, 0.05)
        : 0.016;
      lastFrameRef.current = timestamp;
      timeRef.current += dt;
      const time = timeRef.current;

      // everything scales off the panel width so it survives a phone
      const s = Math.max(0.68, Math.min(1, w / 720));
      const ac = getAccent(scenario);
      const ax = APERTURE.x * w;
      const ay = APERTURE.y * h;

      // --- Ink ---
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);

      // --- Dot grid ---
      ctx.fillStyle = "#FFFFFF";
      ctx.globalAlpha = 0.045;
      const spacing = 26;
      for (let gx = spacing / 2; gx < w; gx += spacing) {
        for (let gy = spacing / 2; gy < h; gy += spacing) {
          ctx.fillRect(gx, gy, 1, 1);
        }
      }
      ctx.globalAlpha = 1;

      // --- Bloom behind the classifier ---
      const bloom = ctx.createRadialGradient(ax, ay, 0, ax, ay, Math.max(w, h) * 0.42);
      bloom.addColorStop(0, `rgba(${ac.rgb[0]},${ac.rgb[1]},${ac.rgb[2]},0.13)`);
      bloom.addColorStop(0.45, `rgba(${ac.rgb[0]},${ac.rgb[1]},${ac.rgb[2]},0.03)`);
      bloom.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);

      // --- Conduits ---
      for (let pi = 0; pi < PATHS.length; pi++) {
        const path = PATHS[pi];
        const hot = isHotPath(pi, scenario);
        ctx.beginPath();
        ctx.moveTo(path.x0 * w, path.y0 * h);
        ctx.bezierCurveTo(
          path.cx0 * w, path.cy0 * h,
          path.cx1 * w, path.cy1 * h,
          path.x1 * w, path.y1 * h
        );
        ctx.strokeStyle = hot
          ? `rgba(${ac.rgb[0]},${ac.rgb[1]},${ac.rgb[2]},0.28)`
          : "rgba(255,255,255,0.09)";
        ctx.lineWidth = hot ? 1.6 : 1;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // --- Particles (additive: overlapping traffic burns brighter) ---
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const p of particlesRef.current) {
        const path = PATHS[p.pathIdx];
        if (!path) continue;

        p.t += p.speed * dt;
        if (p.t > 1) {
          p.t -= 1;
          p.trail = [];
        }

        const pos = getPoint(path, p.t, w, h);
        p.trail.push({ x: pos.x, y: pos.y });
        if (p.trail.length > p.trailLen) p.trail.shift();

        const len = p.trail.length;
        for (let i = 0; i < len - 1; i++) {
          const q = i / (len - 1); // 0 = oldest
          ctx.beginPath();
          ctx.moveTo(p.trail[i].x, p.trail[i].y);
          ctx.lineTo(p.trail[i + 1].x, p.trail[i + 1].y);
          ctx.strokeStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${q * q * 0.3})`;
          ctx.lineWidth = p.size * 1.6 * q;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        // Soft halo + hard core. These alphas are kept low on purpose: under
        // "lighter" a dense path stacks dozens of halos and anything brighter
        // saturates to a solid white bar instead of reading as packets.
        const halo = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, p.size * 3.4);
        halo.addColorStop(0, `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0.22)`);
        halo.addColorStop(1, `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * 3.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0.8)`;
        ctx.fill();
      }
      ctx.restore();

      // --- The classifier aperture ---
      const isThreat = scenario !== "NORMAL";
      const octR = 42 * s * (1 + Math.sin(time * 0.8) * 0.014);

      ctx.save();
      ctx.translate(ax, ay);

      // expanding rings — faster and angrier under threat
      const ringSpeed = isThreat ? 0.85 : 0.4;
      for (let k = 0; k < 3; k++) {
        const phase = (time * ringSpeed + k / 3) % 1;
        ctx.beginPath();
        ctx.arc(0, 0, octR * (1 + phase * 1.9), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ac.rgb[0]},${ac.rgb[1]},${ac.rgb[2]},${(1 - phase) * 0.22})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // octagon well: cut out of the ink, not a white chip on top of it
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI * 2) / 8 - Math.PI / 8;
        const px = Math.cos(a) * octR;
        const py = Math.sin(a) * octR;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fill();
      ctx.strokeStyle = `rgba(${ac.rgb[0]},${ac.rgb[1]},${ac.rgb[2]},0.75)`;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // caliper ticks, slowly rotating
      ctx.save();
      ctx.rotate(time * (isThreat ? 0.45 : 0.14));
      ctx.strokeStyle = ac.hex;
      ctx.lineWidth = 2 * s;
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI * 2) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * octR * 0.82, Math.sin(a) * octR * 0.82);
        ctx.lineTo(Math.cos(a) * octR * 1.04, Math.sin(a) * octR * 1.04);
        ctx.stroke();
      }
      ctx.restore();

      // core
      const coreR = (10 + Math.sin(time * 1.5) * 1.1) * s;
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 3);
      core.addColorStop(0, `rgba(${ac.rgb[0]},${ac.rgb[1]},${ac.rgb[2]},0.95)`);
      core.addColorStop(0.35, `rgba(${ac.rgb[0]},${ac.rgb[1]},${ac.rgb[2]},0.35)`);
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // --- Decision label, set in type rather than in a pill ---
      ctx.font = `bold ${10 * s}px ui-monospace, monospace`;
      ctx.fillStyle = ac.hex;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const dl = getDecisionLabel(scenario);
      ctx.fillText(dl.split("").join(" "), ax, ay + octR + 22 * s);

      // --- Nodes: a light and a name, no card ---
      for (const node of NODES) {
        const nx = node.x * w;
        const ny = node.y * h;
        const led = getNodeColor(node.id, scenario);
        const hot = led !== EMERALD_HEX;
        const inward = node.x < 0.5 ? 1 : -1;

        // pulse ring on the node under attack
        if (hot) {
          const phase = (time * 1.1) % 1;
          ctx.beginPath();
          ctx.arc(nx, ny, 5 + phase * 16, 0, Math.PI * 2);
          ctx.strokeStyle = `${led}${Math.round((1 - phase) * 90)
            .toString(16)
            .padStart(2, "0")}`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, 13);
        g.addColorStop(0, `${led}99`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(nx, ny, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(nx, ny, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = led;
        ctx.fill();

        const ly = ny + node.dy * s;
        ctx.textAlign = inward === 1 ? "left" : "right";
        ctx.textBaseline = "middle";
        ctx.font = `bold ${10.5 * s}px ui-monospace, monospace`;
        ctx.fillStyle = hot ? led : "rgba(255,255,255,0.88)";
        ctx.fillText(node.label, nx + inward * 12, ly - 6 * s);

        ctx.font = `${8.5 * s}px ui-monospace, monospace`;
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.fillText(node.sub, nx + inward * 12, ly + 7 * s);
      }

      // --- Untrusted origin, only when it is the story ---
      if (scenario === "DDOS") {
        ctx.textAlign = "left";
        ctx.font = `bold ${9 * s}px ui-monospace, monospace`;
        ctx.fillStyle = CRIMSON_HEX;
        ctx.fillText("WAN · UNTRUSTED", 10, 0.25 * h + 26 * s);
      }

      animRef.current = requestAnimationFrame(drawFrame);
    }

    animRef.current = requestAnimationFrame(drawFrame);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-3 left-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
        Topology // test mode
      </div>
    </div>
  );
}
