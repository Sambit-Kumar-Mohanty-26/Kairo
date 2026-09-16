"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import KairoWordmark from "../brand/KairoWordmark";

/* The bar reads like the section eyebrows rather than a stock link row:
   numbered, mono, and carrying a lozenge that slides to whichever section
   you are actually standing in. */
const LINKS = [
  { n: "02", label: "Signal", id: "signal-transformation" },
  { n: "03", label: "Detection", id: "detection" },
  { n: "04", label: "Investigation", id: "investigation" },
  { n: "05", label: "Test Kairo", id: "test-kairo" },
  { n: "06", label: "Platform", id: "platform" },
  { n: "07", label: "Research", id: "research" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const items = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  // one listener for both jobs: the bar's own state, and which section owns
  // the reading line a third of the way down the viewport
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const line = window.innerHeight * 0.35;
      let cur: string | null = null;
      for (const l of LINKS) {
        const el = document.getElementById(l.id);
        if (el && el.getBoundingClientRect().top <= line) cur = l.id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = active ? items.current[active] : null;
    setPill(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [active]);

  return (
    <div className="fixed top-4 left-0 right-0 z-50 px-4 pointer-events-none">
      <header
        className={`max-w-5xl mx-auto pl-5 pr-2.5 sm:pl-6 sm:pr-3 rounded-full bg-[#FFFFEB]/80 backdrop-blur-xl border border-[#DCDDCB]/80 flex items-center justify-between pointer-events-auto transition-all duration-300 ${
          scrolled
            ? "h-13 sm:h-14 shadow-[0_10px_30px_-12px_rgba(23,25,23,0.22)]"
            : "h-14 sm:h-16 shadow-[0_2px_16px_-6px_rgba(23,25,23,0.10)]"
        }`}
      >
        <a href="#top" className="flex items-center cursor-pointer" aria-label="Kairo, back to top">
          <KairoWordmark size={22} />
        </a>

        <nav className="hidden md:flex items-center relative">
          {/* the lozenge lives behind the items and is measured, not guessed */}
          <span
            aria-hidden
            className="absolute inset-y-1 rounded-full bg-[#171917]/[0.055] transition-all duration-500"
            style={{
              transitionTimingFunction: "var(--ease-cinematic)",
              transform: `translateX(${pill?.x ?? 0}px)`,
              width: pill?.w ?? 0,
              opacity: pill ? 1 : 0,
            }}
          />
          {LINKS.map((l) => {
            const on = active === l.id;
            return (
              <a
                key={l.id}
                href={`#${l.id}`}
                ref={(el) => {
                  items.current[l.id] = el;
                }}
                aria-current={on ? "true" : undefined}
                className="relative flex items-baseline gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.13em] transition-colors duration-200 group"
              >
                <span className={on ? "text-[#059669]" : "text-[#171917]/25 group-hover:text-[#171917]/45"}>
                  {l.n}
                </span>
                <span className={on ? "text-[#171917]" : "text-[#62665F] group-hover:text-[#171917]"}>
                  {l.label}
                </span>
              </a>
            );
          })}
        </nav>

        <Link href="/login" className="btn-pill-lavender text-xs !py-1.5 !px-3.5 sm:!px-4">
          <span>Enter Kairo</span>
          <span className="text-[11px] opacity-70">→</span>
        </Link>
      </header>
    </div>
  );
}
