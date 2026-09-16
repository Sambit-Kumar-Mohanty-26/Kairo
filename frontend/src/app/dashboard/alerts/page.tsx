"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useConsole } from "@/components/dashboard/DemoProvider";
import { clock, sevColour } from "@/components/dashboard/DetectionTable";
import { CRITICAL_AT, PROFILES, RESPONSES, type Status } from "@/lib/demo";

/* Threats is the record. Alerts is the queue — only what is unresolved and
   loud enough to act on, in the order it has to be acted on. */
const STATES: { key: Status | "open"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "new", label: "New" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "investigating", label: "Investigating" },
  { key: "resolved", label: "Resolved" },
  { key: "false-positive", label: "False positive" },
];

const NEXT: Record<string, { to: Status; label: string }[]> = {
  new: [
    { to: "acknowledged", label: "Acknowledge" },
    { to: "investigating", label: "Investigate" },
  ],
  acknowledged: [{ to: "investigating", label: "Investigate" }],
  investigating: [],
  resolved: [],
  "false-positive": [],
};

export default function AlertsPage() {
  const { detections, setStatus, office, landed } = useConsole();
  const [filter, setFilter] = useState<Status | "open">("open");
  const [id, setId] = useState<string | null>(null);

  // Alerts are the actionable end of the log. Normal flows never queue.
  const alerts = useMemo(
    () => detections.filter((d) => d.attack !== "Normal" && d.risk >= 70),
    [detections],
  );

  const list = useMemo(
    () =>
      filter === "open"
        ? alerts.filter((d) => d.status !== "resolved" && d.status !== "false-positive")
        : alerts.filter((d) => d.status === filter),
    [alerts, filter],
  );

  // A detection that just landed is the one you want to be looking at.
  useEffect(() => {
    if (landed && alerts.some((d) => d.id === landed)) {
      setFilter("open");
      setId(landed);
    }
  }, [landed, alerts]);

  const selected = list.find((d) => d.id === id) ?? list[0] ?? null;
  const openCount = alerts.filter(
    (d) => d.status !== "resolved" && d.status !== "false-positive",
  ).length;

  return (
    <div className="px-6 sm:px-10 pb-24">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // 05 — Alerts
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          {openCount > 0 ? (
            <>
              {openCount} alert{openCount === 1 ? "" : "s"} waiting on a decision.
            </>
          ) : (
            <>The queue is clear.</>
          )}
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[56ch]">
          {office === "all" ? "Across all offices" : `In ${office}`}. Closing an alert is not
          bookkeeping — your verdict becomes a training label.
        </p>
      </header>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-[#DCDDCB] py-3">
        {STATES.map((s) => {
          const n = s.key === "open" ? openCount : alerts.filter((d) => d.status === s.key).length;
          const on = filter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={`font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-200 ${
                on ? "text-[#171917]" : "text-[#8A8E86] hover:text-[#62665F]"
              }`}
            >
              {s.label} <span className="tabular-nums text-[#C9CBBE]">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid lg:grid-cols-[1fr_380px] gap-px bg-[#DCDDCB]">
        {/* ---- queue ---- */}
        <section className="bg-[#FFFFEB] lg:pr-8">
          <div className="divide-y divide-[#E8E8D8] border-b border-[#E8E8D8]">
            {list.map((d) => {
              const on = selected?.id === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setId(d.id)}
                  className="group w-full flex items-start gap-4 py-4 text-left"
                  style={
                    landed === d.id
                      ? { animation: "cinematicRise 900ms var(--ease-cinematic) both" }
                      : undefined
                  }
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 mt-[9px]"
                    style={{ background: on ? sevColour(d) : "#DCDDCB" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block font-serif text-[19px] leading-snug transition-colors duration-200 ${
                        on ? "text-[#171917]" : "text-[#62665F] group-hover:text-[#171917]"
                      }`}
                    >
                      {d.risk >= CRITICAL_AT ? "Critical " : ""}
                      {d.attack} detected in {d.office} Office.
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8E86] mt-1.5">
                      {clock(d.at)} · {d.sensor} · {d.source} · risk{" "}
                      <span style={{ color: sevColour(d) }}>{d.risk}</span>
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-[#8A8E86] mt-[5px] hidden sm:block">
                    {d.status.replace("-", " ")}
                  </span>
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="py-10 text-[14px] text-[#8A8E86]">Nothing in this state.</p>
            )}
          </div>
        </section>

        {/* ---- decision ---- */}
        <aside className="bg-[#FFFFEB] lg:pl-8 pt-8 lg:pt-0">
          {selected ? (
            <div className="lg:sticky lg:top-[78px]">
              <div className="rounded-2xl bg-[#111413] text-white p-6">
                <span
                  className="font-mono text-[9.5px] uppercase tracking-[0.2em]"
                  style={{ color: selected.risk >= CRITICAL_AT ? "#FB7185" : "#FBBF24" }}
                >
                  {selected.risk >= CRITICAL_AT ? "Critical" : "Elevated"} · {selected.attack}
                </span>
                <div className="flex items-end gap-8 mt-3">
                  <Figure v={`${(selected.confidence * 100).toFixed(1)}%`} k="Confidence" />
                  <Figure
                    v={String(selected.risk)}
                    k="Risk / 100"
                    tone={selected.risk >= CRITICAL_AT ? "#FB7185" : "#FBBF24"}
                  />
                </div>
                <p className="mt-5 pt-4 border-t border-white/[0.08] font-mono text-[10.5px] text-[#8A8E86] leading-relaxed">
                  {selected.source} → {selected.target}
                  <br />
                  {PROFILES[selected.attack].evidence}
                </p>
              </div>

              <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86] mt-8">
                Kairo recommends
              </h2>
              <div className="mt-3 flex flex-col gap-2 items-start">
                {RESPONSES[selected.attack].map((r) => (
                  <button
                    key={r}
                    onClick={() => setStatus(selected.id, "investigating")}
                    className="text-left text-[13.5px] text-[#171917] border border-[#DCDDCB] rounded-full px-4 py-2 hover:bg-[#F0E8F8] transition-colors duration-200"
                  >
                    {r}
                  </button>
                ))}
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#8A8E86] mt-1">
                  Responses are recorded, not executed
                </p>
              </div>

              <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86] mt-8">
                Decision
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {NEXT[selected.status].map((n) => (
                  <button
                    key={n.to}
                    onClick={() => setStatus(selected.id, n.to)}
                    className="rounded-full border border-[#DCDDCB] text-[13px] px-4 py-2 text-[#62665F] hover:text-[#171917] transition-colors duration-200"
                  >
                    {n.label}
                  </button>
                ))}
                <button
                  onClick={() => setStatus(selected.id, "resolved")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#171917] text-[#FFFFEB] text-[13px] px-4 py-2 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Resolve
                </button>
                <button
                  onClick={() => setStatus(selected.id, "false-positive")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#DCDDCB] text-[13px] px-4 py-2 text-[#62665F] hover:text-[#171917] transition-colors duration-200"
                >
                  <X className="w-3.5 h-3.5" />
                  False positive
                </button>
              </div>
              <p className="text-[12.5px] leading-relaxed text-[#8A8E86] mt-4 max-w-[38ch]">
                A resolution writes a labelled row into the validated pool. False positives are the
                ones the next model version learns the most from.
              </p>
            </div>
          ) : (
            <p className="text-[14px] text-[#8A8E86]">Nothing selected.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Figure({ v, k, tone }: { v: string; k: string; tone?: string }) {
  return (
    <div>
      <div className="font-serif text-[34px] leading-none" style={{ color: tone }}>
        {v}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86] mt-2">{k}</div>
    </div>
  );
}
