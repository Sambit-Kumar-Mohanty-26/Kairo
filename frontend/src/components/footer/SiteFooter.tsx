"use client";

import React, { useEffect, useRef, useState } from "react";
import KairoWordmark from "@/components/brand/KairoWordmark";

/* ===========================================================================
   SITE FOOTER
   Continues the closing slab rather than starting a new colour, so the page
   ends as one dark movement. The third column is the one most sites do not
   print: what is still not wired.
   =========================================================================== */

const COLUMNS: { head: string; items: { label: string; href?: string; note?: string }[] }[] = [
  {
    head: "Product",
    items: [
      { label: "From traffic to understanding", href: "#signal-transformation" },
      { label: "Detect what matters", href: "#detection" },
      { label: "From alert to understanding", href: "#investigation" },
      { label: "Test Kairo", href: "#test-kairo" },
      { label: "One intelligence layer", href: "#platform" },
      { label: "The intelligence behind Kairo", href: "#research" },
    ],
  },
  {
    head: "Coverage",
    items: [
      { label: "Six attack families", note: "plus normal traffic" },
      { label: "CICIDS2017", note: "training and held-out evaluation" },
      { label: "UNSW-NB15", note: "generalization, no retraining" },
      { label: "Ensemble of five candidates", note: "voting and stacking" },
      { label: "Routers, firewalls, sensors", note: "one verdict format" },
    ],
  },
  {
    head: "Not yet wired",
    items: [
      { label: "Model service", note: "the console is a front-end preview" },
      { label: "Live telemetry", note: "flows are replayed, not captured" },
      { label: "Automated response", note: "designed, deliberately disabled" },
      { label: "Every metric on this page", note: "ours to measure, not to borrow" },
    ],
  },
];

const LEGAL = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Security", href: "/security" },
];

export default function SiteFooter() {
  const seal = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  // toggles both ways, so the seal plays again on every return visit
  useEffect(() => {
    const el = seal.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setSeen(e.isIntersecting),
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <footer className="relative bg-[#0B0E0D] text-[#FFFFEB] overflow-hidden">
      <div className="border-t border-white/8">
        <div className="mx-auto w-full max-w-[1180px] px-6 sm:px-10 pt-20 sm:pt-24 pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14">
            {/* brand + position — 3 + 3·3 fills the twelve exactly, so the
                three lists stay on one row */}
            <div className="lg:col-span-3">
              <KairoWordmark size={26} theme="dark" showSubtitle />
              <p className="text-[14px] leading-relaxed text-white/45 mt-7 max-w-[34ch]">
                Network behaviour turned into security intelligence — detected,
                classified and explained, on evidence you can read.
              </p>
              <a
                href="mailto:hello@kairo.ai"
                className="inline-block font-sans text-[13.5px] text-white/65 hover:text-[#FFFFEB] transition-colors duration-200 mt-6 border-b border-white/15 pb-0.5"
              >
                hello@kairo.ai
              </a>
            </div>

            {/* three columns */}
            {COLUMNS.map((c) => (
              <div key={c.head} className="lg:col-span-3">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 pb-4 border-b border-white/8">
                  {c.head}
                </div>
                <ul className="mt-4 space-y-3.5">
                  {c.items.map((it) => (
                    <li key={it.label}>
                      {it.href ? (
                        <a
                          href={it.href}
                          className="font-sans text-[13.5px] leading-snug text-white/65 hover:text-[#FFFFEB] transition-colors duration-200"
                        >
                          {it.label}
                        </a>
                      ) : (
                        <span className="font-sans text-[13.5px] leading-snug text-white/65">
                          {it.label}
                        </span>
                      )}
                      {it.note && (
                        <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-white/25 mt-1">
                          {it.note}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* closing seal: the guard draws itself up, the decision lands, and the
          name rises letter by letter — replayed every time it comes into view */}
      <div
        ref={seal}
        aria-hidden
        className={`mx-auto w-full max-w-[1180px] px-6 sm:px-10 select-none flex items-end gap-4 sm:gap-7 pb-12 sm:pb-16 ${
          seen ? "seal-on" : ""
        }`}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          className="shrink-0 mb-[0.02em]"
          style={{ width: "clamp(58px, 14vw, 205px)" }}
        >
          {/* the guard draws itself, the stem rises, the stream and the answer
              grow out of the gap, then the decision lands in it */}
          <defs>
            <linearGradient
              id="sealBlade"
              x1="13.1"
              y1="15.66"
              x2="23.11"
              y2="7.95"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="rgba(110,231,183,0.18)" />
              <stop offset="1" stopColor="rgba(110,231,183,0.52)" />
            </linearGradient>
          </defs>
          <path
            className="seal-guard"
            pathLength={100}
            d="M16 1.37L4.4 5.58L4.4 17.51C4.47 22.28 9.86 28.85 16 30.64C22.14 28.85 27.53 22.28 27.6 17.51L27.6 5.58Z"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.7"
            strokeLinejoin="miter"
            strokeMiterlimit={8}
          />
          <path
            className="seal-stem"
            d="M9.85 7.95L12.51 7.95A0.44 0.44 0 0 1 12.95 8.39L12.95 13.64A2.03 2.03 0 0 0 12.95 17.69L12.95 22.52A0.44 0.44 0 0 1 12.51 22.96L9.85 22.96A0.44 0.44 0 0 1 9.41 22.52L9.41 8.39A0.44 0.44 0 0 1 9.85 7.95Z"
            fill="rgba(255,255,255,0.15)"
          />
          <path
            className="seal-blade-up"
            d="M13.56 13.68L18.92 7.95L23.11 7.95L16.5 15.02L15.03 15.02A2.03 2.03 0 0 0 13.56 13.68Z"
            fill="url(#sealBlade)"
          />
          <path
            className="seal-blade-down"
            d="M13.76 17.59L18.79 22.96L22.89 22.96L16.67 16.31L15.03 16.31A2.03 2.03 0 0 1 13.76 17.59Z"
            fill="rgba(255,255,255,0.15)"
          />
          <circle className="seal-node" cx="13.1" cy="15.66" r="1.48" fill="#6EE7B7" />
        </svg>

        <div
          className="font-serif text-white/[0.09] leading-[0.74] tracking-[-0.03em] flex"
          style={{ fontSize: "clamp(74px, 18vw, 270px)" }}
        >
          {"Kairo".split("").map((ch, i) => (
            <span key={i} className="seal-letter" style={{ animationDelay: `${900 + i * 70}ms` }}>
              {ch}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="mx-auto w-full max-w-[1180px] px-6 sm:px-10 py-6 flex flex-wrap items-center gap-x-8 gap-y-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/25">
          <span>© {new Date().getFullYear()} Kairo</span>
          {LEGAL.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="hover:text-white/60 transition-colors duration-200"
            >
              {l.label}
            </a>
          ))}
          <span className="sm:ml-auto">Results pending our own evaluation</span>
        </div>
      </div>
    </footer>
  );
}
