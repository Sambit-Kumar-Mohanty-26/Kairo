"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useConsole } from "@/components/dashboard/DemoProvider";
import Topology from "@/components/dashboard/Topology";
import { CRITICAL_AT, type Detection } from "@/lib/demo";

export default function NetworkPage() {
  const { allDetections, offices, office, setOffice } = useConsole();
  const [shown, setShown] = useState<string | null>(null);

  // Per office: what is still open, and the worst of it.
  const rows = useMemo(
    () =>
      offices.map((o) => {
        const mine = allDetections.filter((d) => d.office === o.name);
        const open = mine.filter((d) => d.status !== "resolved" && d.status !== "false-positive");
        const risk = open.reduce((n, d) => Math.max(n, d.risk), 0);
        const hot =
          open
            .filter((d) => d.risk >= 70)
            .sort((a, b) => b.at - a.at)[0] ?? null;
        return { ...o, threats: mine.length, open: open.length, risk, hot: hot as Detection | null };
      }),
    [offices, allDetections],
  );

  const current = rows.find((r) => r.name === (shown ?? (office !== "all" ? office : rows[0]?.name)));

  return (
    <div className="px-6 sm:px-10 pb-24">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // 04 — Network
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          Where the traffic comes from.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[56ch]">
          Every office is a set of monitored sources. A source is the point a flow was captured at —
          it is also where a detection gets pinned.
        </p>
      </header>

      {/* ---- office tier ---- */}
      <section className="border-y border-[#DCDDCB] divide-y divide-[#E8E8D8]">
        {rows.map((r) => {
          const active = current?.name === r.name;
          return (
            <button
              key={r.name}
              onClick={() => {
                setShown(r.name);
                setOffice(r.name);
              }}
              className="group w-full flex items-baseline gap-5 sm:gap-8 py-5 text-left"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 self-center transition-colors duration-200 ${
                  active ? "bg-[#16DFA0]" : "bg-[#DCDDCB]"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-serif text-[24px] sm:text-[27px] leading-none transition-colors duration-200 ${
                    active ? "text-[#171917]" : "text-[#62665F] group-hover:text-[#171917]"
                  }`}
                >
                  {r.name}
                </span>
                <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8E86] mt-2">
                  {r.sensors.length} source{r.sensors.length === 1 ? "" : "s"} ·{" "}
                  {r.sensors.join(" · ") || "none yet"}
                </span>
              </span>
              <Stat k="Threats" v={r.threats} />
              <Stat k="Open" v={r.open} tone={r.open > 0 ? "#D97706" : undefined} />
              <Stat
                k="Peak risk"
                v={r.risk}
                tone={r.risk >= CRITICAL_AT ? "#E11D48" : r.risk >= 70 ? "#D97706" : undefined}
              />
            </button>
          );
        })}
        {rows.length === 0 && (
          <p className="py-8 text-[14px] text-[#8A8E86]">
            No offices yet.{" "}
            <Link href="/dashboard/settings" className="underline underline-offset-4">
              Add one in Settings
            </Link>
            .
          </p>
        )}
      </section>

      {/* ---- topology ---- */}
      {current && (
        <section className="mt-12 rounded-2xl sm:rounded-3xl bg-[#111413] text-white border border-white/[0.08] shadow-[0_16px_36px_-6px_rgba(17,20,19,0.16)] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.2em]">
              {current.name} · topology
            </span>
            <span
              className="font-mono text-[9.5px] uppercase tracking-[0.18em]"
              style={{ color: current.hot ? "#FB7185" : "#16DFA0" }}
            >
              {current.hot ? `${current.hot.attack} on ${current.hot.sensor}` : "All paths nominal"}
            </span>
          </div>
          <div className="p-6 overflow-x-auto">
            <div className="min-w-[620px] max-w-[840px] mx-auto">
              <Topology sources={current.sensors} hot={current.hot} />
            </div>
          </div>
          {current.hot && (
            <div className="px-6 py-4 border-t border-white/[0.08] flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10.5px] text-[#8A8E86]">
              <span>
                {current.hot.source} → {current.hot.target}
              </span>
              <span className="tabular-nums">risk {current.hot.risk}</span>
              <Link
                href="/dashboard/alerts"
                className="group ml-auto inline-flex items-center gap-1.5 uppercase tracking-[0.16em] text-white/70 hover:text-white transition-colors"
              >
                Triage
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return (
    <span className="shrink-0 text-right">
      <span className="block font-serif text-[26px] leading-none tabular-nums" style={{ color: tone }}>
        {v}
      </span>
      <span className="block font-mono text-[8.5px] uppercase tracking-[0.2em] text-[#8A8E86] mt-2">
        {k}
      </span>
    </span>
  );
}
