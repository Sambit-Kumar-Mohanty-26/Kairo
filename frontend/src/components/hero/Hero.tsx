"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Container from "../primitives/Container";
import KairoField from "../field/KairoField";
import NoiseField from "./NoiseField";
import { ScenarioType } from "../field/types";
import { ArrowRight, Terminal, Fingerprint, X } from "lucide-react";

export default function Hero() {
  const [scenario, setScenario] = useState<ScenarioType>("NORMAL");
  const [open, setOpen] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);

  // Right-drag relocates the dial and it stays where it was dropped. Written
  // straight to the node's left/top so a drag costs no re-renders; left click
  // is left alone so it still just opens the console.
  useEffect(() => {
    const el = dialRef.current;
    if (!el) return;
    let grab: { dx: number; dy: number } | null = null;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      const r = el.getBoundingClientRect();
      grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!grab) return;
      const r = el.getBoundingClientRect();
      const clamp = (v: number, max: number) => Math.min(Math.max(8, v), max - 8);
      el.style.left = `${clamp(e.clientX - grab.dx, window.innerWidth - r.width)}px`;
      el.style.top = `${clamp(e.clientY - grab.dy, window.innerHeight - r.height)}px`;
      el.style.bottom = "auto";
    };
    const stop = () => { grab = null; };
    const noMenu = (e: MouseEvent) => e.preventDefault();

    el.addEventListener("mousedown", onDown);
    el.addEventListener("contextmenu", noMenu);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    return () => {
      el.removeEventListener("mousedown", onDown);
      el.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <section className="relative min-h-[100svh] pt-20 sm:pt-24 pb-4 overflow-hidden flex flex-col justify-between bg-[#FFFFEB]">
      <Container className="relative z-10 flex-1 flex flex-col justify-between">
        {/* Main 2-Column Balanced Editorial Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto">
          {/* Left Column: Eyebrow, Large Editorial Headline, Supporting copy, and CTAs */}
          <div className="lg:col-span-6 xl:col-span-6 space-y-6 sm:space-y-7">
            {/* Small Eyebrow with Cinematic Entrance */}
            <div className="animate-cinematic-eyebrow">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1 rounded-full bg-[#FFFFEB] border border-[#DCDDCB] text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-[#62665F] shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
                <span>Network Intelligence // 01</span>
              </div>
            </div>

            {/* Main Editorial Headline (EB Garamond, Large & Cinematic) */}
            <h1 className="text-4xl sm:text-6xl lg:text-[66px] xl:text-[76px] font-serif text-[#171917] leading-[1.02] tracking-tight">
              <span className="block animate-cinematic-line-1 overflow-hidden">
                See what your
              </span>
              <span className="block animate-cinematic-line-2 overflow-hidden">
                network doesn&apos;t
              </span>
              <span className="block animate-cinematic-line-3 overflow-hidden">
                <em className="italic font-normal">say out loud.</em>
              </span>
            </h1>

            {/* Supporting Copy (Figtree, Editorial Measure) */}
            <p className="animate-cinematic-copy text-sm sm:text-base lg:text-[17px] text-[#62665F] leading-relaxed max-w-[500px]">
              Kairo turns network behavior into security intelligence — detecting, classifying, and explaining threats before they become security incidents.
            </p>

            {/* Primary & Secondary Tactile CTAs (Equal Height, Baseline Aligned) */}
            <div className="animate-cinematic-actions pt-2 flex flex-wrap items-center gap-3.5">
              <Link
                href="/login"
                className="h-[46px] inline-flex items-center gap-2 px-6 rounded-full bg-[#E4D4F8] text-[#171917] border border-[#171917] text-sm font-semibold tracking-tight shadow-xs hover:shadow-sm hover:-translate-y-0.5 transition-all group cursor-pointer"
              >
                <span>Enter Kairo</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>

              <a
                href="#test-kairo"
                className="h-[46px] inline-flex items-center gap-2 px-5 rounded-full bg-[#FFFFEB] text-[#62665F] border border-[#DCDDCB] text-sm font-medium tracking-tight hover:text-[#171917] hover:border-[#171917] hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <Terminal className="w-4 h-4 text-[#8A8E86]" />
                <span>Explore The Lab</span>
              </a>
            </div>
          </div>

          {/* Right Column: raw telemetry noise with the signal resolving out of it */}
          <div className="lg:col-span-6 xl:col-span-6 relative flex items-center lg:justify-end">
            <NoiseField className="w-full" />
          </div>
        </div>

        {/* Bottom Horizon Transition Anchor */}
        <div className="animate-cinematic-footer pt-4 border-t border-[#DCDDCB]/70 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] sm:text-[10.5px] text-[#8A8E86]">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[#171917] font-semibold">HELD-OUT EVALUATION</span>
            <span>·</span>
            <span>MULTI-BRANCH TELEMETRY</span>
            <span>·</span>
            <span>EXPLAINABLE INFERENCE</span>
          </div>

          <div className="hidden sm:flex items-center">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] hover:text-[#171917] transition-colors">
              SCROLL TO DISCOVER BEHAVIOR ↓
            </span>
          </div>
        </div>
      </Container>

      {/* Bottom-left page furniture: the console lives behind this dial, and it
          stays put through the whole scroll. The entrance animation sits on the
          wrapper so it never overrides the button's magnetic transform. */}
      <div
        ref={dialRef}
        className="fixed bottom-24 left-4 sm:bottom-10 sm:left-8 z-40 select-none animate-cinematic-actions"
      >
        <button
          onClick={() => setOpen(true)}
          /* The cream hairline is invisible on the ivory page but outlines the
             puck where it passes over the dark slabs. */
          className="group relative w-[52px] h-[52px] rounded-full bg-[#171917] text-[#FFFFEB] flex items-center justify-center cursor-pointer shadow-[0_0_0_1.5px_rgba(255,255,235,0.3),0_12px_26px_-10px_rgba(23,25,23,0.55)] transition-transform duration-200 ease-out active:scale-95"
          aria-label="Open the live network topology"
          title="Click to open · right-drag to move"
        >
          <svg
            className="absolute inset-0 w-full h-full animate-spin [animation-duration:18s]"
            viewBox="0 0 100 100"
            fill="none"
          >
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="#FFFFEB"
              strokeOpacity={0.3}
              strokeWidth={1.4}
              strokeDasharray="2 7"
            />
          </svg>
          <Fingerprint className="w-[19px] h-[19px] text-[#6EE7B7] transition-colors duration-300 group-hover:text-[#FFFFEB]" />
          <span className="absolute left-full ml-3 whitespace-nowrap font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[#62665F] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            Live topology
          </span>
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Live network topology"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
        >
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-[#171917]/75 backdrop-blur-[3px]"
            style={{ animation: "cinematicFade 400ms var(--ease-cinematic) both" }}
          />
          <div
            className="relative w-full max-w-[1040px]"
            style={{ animation: "cinematicFade 620ms var(--ease-cinematic) both" }}
          >
            <KairoField
              scenario={scenario}
              onScenarioChange={(sc) => setScenario(sc)}
            />
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-[#FFFFEB] text-[#171917] border border-[#171917] flex items-center justify-center cursor-pointer hover:rotate-90 transition-transform duration-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
