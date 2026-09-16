"use client";

import React, { useMemo, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { useConsole } from "@/components/dashboard/DemoProvider";
import {
  CANDIDATE,
  DEPLOYED,
  ENSEMBLE,
  POOL,
  RETRAIN_AT,
  featureImportance,
  type ClassMetric,
} from "@/lib/demo";

const MEMBER_COLOUR = ["#16DFA0", "#E4D4F8", "#FBBF24"];

export default function ModelPage() {
  const { allDetections } = useConsole();
  const [decision, setDecision] = useState<"promote" | "reject" | null>(null);

  // Every alert you closed is a labelled row. This is the whole feedback loop,
  // counted rather than described.
  const validated = useMemo(
    () => allDetections.filter((d) => d.status === "resolved" || d.status === "false-positive"),
    [allDetections],
  );
  const poolTotal = POOL.reduce((n, [, c]) => n + c, 0) + validated.length;
  const pct = Math.min(100, (poolTotal / RETRAIN_AT) * 100);

  const features = useMemo(() => featureImportance(), []);
  const maxWeight = features[0]?.weight ?? 1;

  return (
    <div className="px-6 sm:px-10 pb-24 max-w-[1040px]">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // 06 — Model
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          It gets better every time you answer.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[58ch]">
          What is deployed, what it is made of, and what the next version would have to beat.
        </p>
      </header>

      {/* ---- deployed ---- */}
      <section className="rounded-2xl sm:rounded-3xl bg-[#111413] text-white border border-white/[0.08] shadow-[0_16px_36px_-6px_rgba(17,20,19,0.16)] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.2em]">
            Deployed · {DEPLOYED.tag}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#8A8E86]">
            {DEPLOYED.dataset}
          </span>
        </div>
        <div className="p-7 grid sm:grid-cols-[repeat(3,auto)] gap-8 sm:gap-14">
          <Figure v={`${(DEPLOYED.accuracy * 100).toFixed(1)}%`} k="Accuracy" tone="#16DFA0" />
          <Figure v={DEPLOYED.macroF1.toFixed(3)} k="Macro F1" />
          <Figure v={DEPLOYED.trainedAt} k="Trained" />
        </div>

        {/* ensemble: weights as a rule, the same grammar as attack mix */}
        <div className="px-7 pb-7">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
            Weighted soft voting
          </span>
          <div className="mt-3 flex h-[6px] rounded-full overflow-hidden bg-white/[0.08]">
            {ENSEMBLE.map((m, i) => (
              <span
                key={m.name}
                style={{ width: `${m.weight * 100}%`, background: MEMBER_COLOUR[i] }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {ENSEMBLE.map((m, i) => (
              <span key={m.name} className="flex items-baseline gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full self-center"
                  style={{ background: MEMBER_COLOUR[i] }}
                />
                <span className="text-[13.5px]">{m.name}</span>
                <span className="font-serif text-[18px] tabular-nums">
                  {(m.weight * 100).toFixed(0)}%
                </span>
                <span className="font-mono text-[9.5px] text-[#8A8E86]">{m.note}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---- per class ---- */}
      <section className="mt-14">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Per class · {DEPLOYED.tag}
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-y border-[#DCDDCB]">
                {["Class", "Precision", "Recall", "F1", "Support"].map((h, i) => (
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
              {DEPLOYED.classes.map((c) => (
                <tr key={c.cls}>
                  <td className="py-3 font-serif text-[19px]">{c.cls}</td>
                  <Cell v={c.precision} />
                  <Cell v={c.recall} />
                  <Cell v={c.f1} strong />
                  <td className="py-3 text-right font-mono text-[11.5px] text-[#8A8E86] tabular-nums">
                    {c.support.toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- what it looks at ---- */}
      <section className="mt-14">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          What it looks at
        </h2>
        <p className="text-[13.5px] text-[#62665F] mt-2 max-w-[54ch]">
          Aggregate importance across classes. These are CICIDS2017 flow statistics — a verdict can
          always be traced back to them.
        </p>
        <div className="mt-5 flex flex-col divide-y divide-[#E8E8D8] border-y border-[#E8E8D8]">
          {features.map((f) => (
            <div key={f.name} className="flex items-center gap-4 py-2.5">
              <span className="font-mono text-[11.5px] w-[220px] shrink-0 truncate">{f.name}</span>
              <span className="flex-1 h-[3px] bg-[#E8E8D8] rounded-full overflow-hidden">
                <span
                  className="block h-full bg-[#171917]"
                  style={{
                    width: `${(f.weight / maxWeight) * 100}%`,
                    transition: "width 900ms var(--ease-cinematic)",
                  }}
                />
              </span>
              <span className="font-mono text-[10px] text-[#8A8E86] tabular-nums w-[44px] text-right">
                {(f.weight * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- pool ---- */}
      <section className="mt-14">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Retraining pool
        </h2>
        <div className="mt-4 flex items-end gap-10 flex-wrap">
          {POOL.map(([cls, n]) => (
            <span key={cls}>
              <span className="block font-serif text-[32px] leading-none tabular-nums">
                {n.toLocaleString("en-US")}
              </span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86] mt-2">
                {cls}
              </span>
            </span>
          ))}
          <span>
            <span className="block font-serif text-[32px] leading-none tabular-nums text-[#059669]">
              {validated.length}
            </span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[#059669] mt-2">
              From your console
            </span>
          </span>
        </div>

        <div className="mt-6 h-[6px] rounded-full bg-[#E8E8D8] overflow-hidden">
          <span
            className="block h-full bg-[#171917]"
            style={{ width: `${pct}%`, transition: "width 900ms var(--ease-cinematic)" }}
          />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8E86] mt-3">
          {poolTotal.toLocaleString("en-US")} of {RETRAIN_AT.toLocaleString("en-US")} flows before the next
          retrain
        </p>
      </section>

      {/* ---- the gate ---- */}
      <section className="mt-14">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Candidate · {CANDIDATE.tag}
        </h2>
        <p className="text-[13.5px] text-[#62665F] mt-2 max-w-[54ch]">
          A candidate never replaces the deployed model on age. It replaces it on evidence, class by
          class.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-y border-[#DCDDCB]">
                {["Class", DEPLOYED.tag + " F1", CANDIDATE.tag + " F1", "Δ"].map((h, i) => (
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
              {DEPLOYED.classes.map((a, i) => {
                const b = CANDIDATE.classes[i] as ClassMetric;
                const d = b.f1 - a.f1;
                return (
                  <tr key={a.cls}>
                    <td className="py-3 font-serif text-[19px]">{a.cls}</td>
                    <Cell v={a.f1} />
                    <Cell v={b.f1} strong />
                    <td
                      className="py-3 text-right font-mono text-[11.5px] tabular-nums"
                      style={{ color: d >= 0 ? "#059669" : "#E11D48" }}
                    >
                      {d >= 0 ? "+" : ""}
                      {(d * 100).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <Gate ok label={`Macro F1 up ${((CANDIDATE.macroF1 - DEPLOYED.macroF1) * 100).toFixed(1)} points`} />
          <Gate ok label="No class regressed on F1" />
          {/* the one honest wart in the candidate, printed rather than hidden */}
          <Gate label="Botnet precision down 0.3 points — smallest support in the set" />
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setDecision("promote")}
            className="inline-flex items-center gap-2 rounded-full bg-[#171917] text-[#FFFFEB] text-[13px] px-5 py-2.5 transition-transform duration-200 hover:-translate-y-0.5"
          >
            Promote {CANDIDATE.tag}
          </button>
          <button
            onClick={() => setDecision("reject")}
            className="rounded-full border border-[#DCDDCB] text-[13px] px-5 py-2.5 text-[#62665F] hover:text-[#171917] transition-colors duration-200"
          >
            Keep {DEPLOYED.tag}
          </button>
          {decision && (
            <span
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#62665F]"
              style={{ animation: "cinematicFade 600ms var(--ease-cinematic) both" }}
            >
              Recorded — {decision === "promote" ? "promotion" : "rejection"} queued for the
              training service
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function Cell({ v, strong }: { v: number; strong?: boolean }) {
  return (
    <td
      className={`py-3 text-right tabular-nums ${
        strong ? "font-serif text-[18px]" : "font-mono text-[11.5px] text-[#62665F]"
      }`}
    >
      {v.toFixed(3)}
    </td>
  );
}

function Gate({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span className="flex items-start gap-2.5 text-[13.5px] text-[#62665F]">
      {ok ? (
        <Check className="w-3.5 h-3.5 mt-[3px] shrink-0 text-[#059669]" />
      ) : (
        <TriangleAlert className="w-3.5 h-3.5 mt-[3px] shrink-0 text-[#D97706]" />
      )}
      {label}
    </span>
  );
}

function Figure({ v, k, tone }: { v: string; k: string; tone?: string }) {
  return (
    <div>
      <div className="font-serif text-[38px] leading-none" style={{ color: tone }}>
        {v}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86] mt-2">{k}</div>
    </div>
  );
}
