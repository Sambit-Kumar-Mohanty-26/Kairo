import React from "react";
import Link from "next/link";
import KairoWordmark from "@/components/brand/KairoWordmark";
import KairoMark from "@/components/brand/KairoMark";

const READOUTS = [
  "OBSERVE → CLASSIFY → EXPLAIN",
  "SIX ATTACK FAMILIES · ONE VERDICT FORMAT",
  "EVERY DECISION SHOWS ITS EVIDENCE",
];

/**
 * The split shell every /login, /register and /forgot-password page sits in.
 * A route group — (auth) never appears in the URL — so the three pages share
 * this once instead of each rebuilding it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row bg-[#FFFFEB] lg:overflow-hidden">
      {/* mobile: a slim brand strip stands in for the dark panel */}
      <div className="lg:hidden flex items-center justify-between px-6 pt-4">
        <Link href="/" aria-label="Kairo, back to the site">
          <KairoWordmark size={20} />
        </Link>
      </div>

      {/* locked to the viewport, independent of how tall the form gets —
          register's extra fields no longer stretch this panel off-screen */}
      <aside className="hidden lg:flex lg:w-[42%] xl:w-[38%] lg:h-screen relative flex-col justify-between bg-[#111413] text-[#FFFFEB] px-14 pt-8 pb-12 overflow-hidden">
        <Link href="/" className="relative z-10 w-fit" aria-label="Kairo, back to the site">
          <KairoWordmark size={22} theme="dark" />
        </Link>

        {/* watermark guard: draws itself in once on load, then breathes.
            Dimmed per-part like the footer seal — a flat opacity on the
            whole mark washes the green out with it and leaves a grey blob;
            keeping the node and blade in their own low-alpha green is what
            makes it still read as the mark instead of a shape. */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <KairoMark
            size={420}
            strokeColor="rgba(255,255,255,0.14)"
            accentDeep="rgba(10,122,93,0.22)"
            accentColor="rgba(110,231,183,0.85)"
            animated
          />
        </div>

        <div className="relative z-10 flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            {READOUTS.map((line) => (
              <span
                key={line}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#8A8E86]"
              >
                {line}
              </span>
            ))}
          </div>

          <p className="font-serif italic text-2xl leading-snug text-[#DCDDCB] max-w-[340px]">
            Network intelligence, explained.
          </p>
        </div>
      </aside>

      {/* if a page's content is ever taller than the viewport, this scrolls
          on its own — the dark panel never moves */}
      <main className="flex-1 flex items-center justify-center px-6 sm:px-10 py-10 lg:h-screen lg:overflow-y-auto">
        <div className="w-full max-w-[400px] py-6">{children}</div>
      </main>
    </div>
  );
}
