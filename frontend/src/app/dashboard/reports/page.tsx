"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { useConsole } from "@/components/dashboard/DemoProvider";
import { clock } from "@/components/dashboard/DetectionTable";
import { CRITICAL_AT, attackMix, since, topSources, type Detection } from "@/lib/demo";

const MIX_COLOUR: Record<string, string> = {
  DDoS: "#E11D48",
  "Port Scan": "#D97706",
  "Brute Force": "#059669",
  Botnet: "#8A8E86",
};

const PERIODS: [string, number][] = [
  ["24 hours", 86_400_000],
  ["7 days", 7 * 86_400_000],
  ["All", Number.MAX_SAFE_INTEGER],
];

/* The report is a document, not a dashboard with an export button bolted on.
   It reads top to bottom and prints as it reads — the rail and scope bar drop
   out under print:hidden in the shell. */
export default function ReportsPage() {
  const { detections, org, office, offices } = useConsole();
  const [period, setPeriod] = useState(PERIODS[0][0]);
  // the stamp is the one value the server cannot agree with the client on
  const [generated, setGenerated] = useState<number | null>(null);
  useEffect(() => setGenerated(Date.now()), []);

  const ms = PERIODS.find(([l]) => l === period)![1];
  const rows = useMemo(() => since(detections, ms), [detections, ms]);

  const critical = rows.filter((d) => d.risk >= CRITICAL_AT).length;
  const closed = rows.filter((d) => d.status === "resolved" || d.status === "false-positive").length;
  const falsePos = rows.filter((d) => d.status === "false-positive").length;
  const meanConf = rows.length
    ? rows.reduce((n, d) => n + d.confidence, 0) / rows.length
    : 0;
  const mix = useMemo(() => attackMix(rows), [rows]);
  const mixTotal = mix.reduce((n, [, c]) => n + c, 0) || 1;
  const sources = useMemo(() => topSources(rows), [rows]);

  const byOffice = offices.map((o) => {
    const mine = rows.filter((d) => d.office === o.name);
    return {
      name: o.name,
      threats: mine.length,
      critical: mine.filter((d) => d.risk >= CRITICAL_AT).length,
      peak: mine.reduce((n, d) => Math.max(n, d.risk), 0),
    };
  });

  return (
    <div className="px-6 sm:px-10 pb-24 max-w-[860px]">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // 07 — Reports
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          The record, written out.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[56ch]">
          {org} · {office === "all" ? "all offices" : office} · last {period.toLowerCase()}.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-[#DCDDCB] py-3 print:hidden">
        {PERIODS.map(([label]) => (
          <button
            key={label}
            onClick={() => setPeriod(label)}
            className={`font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-200 ${
              period === label ? "text-[#171917]" : "text-[#8A8E86] hover:text-[#62665F]"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => downloadCsv(rows, org, period)}
          className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#62665F] hover:text-[#171917] transition-colors duration-200"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#62665F] hover:text-[#171917] transition-colors duration-200"
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </button>
      </div>

      {/* ---- summary, in sentences ---- */}
      <section className="mt-10">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Summary
        </h2>
        <p className="font-serif text-[22px] sm:text-[26px] leading-[1.45] mt-4 max-w-[46ch]">
          Kairo classified {rows.length} threat{rows.length === 1 ? "" : "s"} in{" "}
          {office === "all" ? "the organisation" : office}, {critical} of them critical. You closed{" "}
          {closed}
          {falsePos > 0 ? `, calling ${falsePos} a false positive` : ""}.
        </p>
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 border-y border-[#DCDDCB] divide-x divide-[#E8E8D8]">
          <Cell k="Threats" v={String(rows.length)} />
          <Cell k="Critical" v={String(critical)} tone={critical > 0 ? "#E11D48" : undefined} />
          <Cell k="Closed" v={String(closed)} />
          <Cell k="Mean confidence" v={`${(meanConf * 100).toFixed(1)}%`} />
        </div>
      </section>

      {/* ---- mix ---- */}
      <section className="mt-12">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Attack mix
        </h2>
        <div className="mt-4 flex h-[6px] rounded-full overflow-hidden bg-[#E8E8D8]">
          {mix.map(([a, c]) => (
            <span key={a} style={{ width: `${(c / mixTotal) * 100}%`, background: MIX_COLOUR[a] }} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          {mix.map(([a, c]) => (
            <span key={a} className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: MIX_COLOUR[a] }} />
              <span className="text-[13.5px] text-[#62665F]">{a}</span>
              <span className="font-serif text-[18px] tabular-nums">{c}</span>
            </span>
          ))}
        </div>
      </section>

      {/* ---- worst sources ---- */}
      <section className="mt-12">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Worst sources
        </h2>
        <table className="w-full border-collapse mt-4">
          <thead>
            <tr className="border-y border-[#DCDDCB]">
              {["Source", "Classified as", "Flows", "Peak risk"].map((h, i) => (
                <th
                  key={h}
                  className={`py-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86] font-normal ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8D8]">
            {sources.map((s) => (
              <tr key={s.source}>
                <td className="py-3 font-mono text-[12px]">{s.source}</td>
                <td className="py-3 text-right text-[13.5px] text-[#62665F]">{s.attack}</td>
                <td className="py-3 text-right font-mono text-[11.5px] tabular-nums text-[#62665F]">
                  {s.hits}
                </td>
                <td
                  className="py-3 text-right font-serif text-[18px] tabular-nums"
                  style={{ color: s.worst >= CRITICAL_AT ? "#E11D48" : undefined }}
                >
                  {s.worst}
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-[14px] text-[#8A8E86]">
                  Nothing was flagged in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ---- by office ---- */}
      <section className="mt-12">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          By office
        </h2>
        <div className="mt-4 divide-y divide-[#E8E8D8] border-y border-[#DCDDCB]">
          {byOffice.map((o) => (
            <div key={o.name} className="flex items-baseline gap-6 py-3.5">
              <span className="font-serif text-[20px] flex-1 min-w-0 truncate">{o.name}</span>
              <Small k="threats" v={o.threats} />
              <Small k="critical" v={o.critical} tone={o.critical > 0 ? "#E11D48" : undefined} />
              <Small k="peak risk" v={o.peak} />
            </div>
          ))}
        </div>
      </section>

      <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#8A8E86] mt-10">
        Generated {generated ? clock(generated) : "—"} · fixture data · Kairo {org}
      </p>
    </div>
  );
}

/* A Blob and an anchor. A CSV library for four columns would be the joke. */
function downloadCsv(rows: Detection[], org: string, period: string) {
  const head = "time,attack,source,target,office,sensor,confidence,risk,status";
  const body = rows
    .map((d) =>
      [
        new Date(d.at).toISOString(),
        d.attack,
        d.source,
        d.target,
        d.office,
        d.sensor,
        d.confidence,
        d.risk,
        d.status,
      ].join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(new Blob([head + "\n" + body], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `kairo-${org.toLowerCase().replace(/\s+/g, "-")}-${period.replace(/\s+/g, "")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Cell({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="py-6 px-5 first:pl-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86]">{k}</div>
      <div className="font-serif text-[38px] leading-none mt-3 tabular-nums" style={{ color: tone }}>
        {v}
      </div>
    </div>
  );
}

function Small({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return (
    <span className="shrink-0 text-right">
      <span className="font-serif text-[20px] tabular-nums" style={{ color: tone }}>
        {v}
      </span>
      <span className="block font-mono text-[8.5px] uppercase tracking-[0.18em] text-[#8A8E86]">
        {k}
      </span>
    </span>
  );
}
