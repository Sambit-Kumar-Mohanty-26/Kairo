"use client";

import React from "react";
import { X } from "lucide-react";
import { PROFILES, RESPONSES, type Detection, type Status } from "@/lib/demo";
import { clock, sevColour } from "./DetectionTable";

const FLOW = [
  "first contact observed",
  "connection rate crosses baseline",
  "classifier scores the window",
  "verdict written to detection store",
  "risk engine scores the incident",
];

/* §10's investigation view, field for field: source, target, time, attack
   type, confidence, important features, timeline — then §11's recommendation. */
export default function DetailPane({
  detection,
  onClose,
  onStatus,
}: {
  detection: Detection | null;
  onClose: () => void;
  onStatus: (id: string, s: Status) => void;
}) {
  const open = detection !== null;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-[#171917]/20 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        className={`fixed top-0 right-0 z-40 h-screen w-full max-w-[520px] bg-[#FFFFEB] border-l border-[#DCDDCB] overflow-y-auto transition-transform duration-[400ms] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-cinematic)" }}
        aria-hidden={!open}
      >
        {detection && <Body d={detection} onClose={onClose} onStatus={onStatus} />}
      </aside>
    </>
  );
}

function Body({
  d,
  onClose,
  onStatus,
}: {
  d: Detection;
  onClose: () => void;
  onStatus: (id: string, s: Status) => void;
}) {
  const colour = sevColour(d);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-8 h-[62px] border-b border-[#DCDDCB]">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Investigation · {d.id}
        </span>
        <button onClick={onClose} className="text-[#8A8E86] hover:text-[#171917] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* verdict, on the instrument surface */}
      <div className="m-8 rounded-2xl bg-[#111413] text-white p-7">
        <span
          className="font-mono text-[9.5px] uppercase tracking-[0.2em]"
          style={{ color: colour === "#059669" ? "#16DFA0" : colour === "#D97706" ? "#FBBF24" : "#FB7185" }}
        >
          {d.risk >= 88 ? "Critical" : d.risk >= 70 ? "High" : "Low"} · {d.attack}
        </span>
        <div className="flex items-end gap-8 mt-4">
          <div>
            <div className="font-serif text-[46px] leading-none">
              {(d.confidence * 100).toFixed(1)}
              <span className="text-[24px] text-[#8A8E86]">%</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86] mt-2">
              Confidence
            </div>
          </div>
          <div>
            <div className="font-serif text-[46px] leading-none" style={{ color: colour === "#059669" ? "#16DFA0" : colour === "#D97706" ? "#FBBF24" : "#FB7185" }}>
              {d.risk}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86] mt-2">
              Risk / 100
            </div>
          </div>
        </div>
        <p className="mt-6 pt-5 border-t border-white/[0.08] font-mono text-[11px] text-[#8A8E86] leading-relaxed">
          {PROFILES[d.attack].evidence}
        </p>
      </div>

      <Section title="Where">
        <Row k="Source" v={d.source} mono />
        <Row k="Target" v={d.target} mono />
        <Row k="Office" v={d.office} />
        <Row k="Sensor" v={d.sensor} mono />
        <Row k="Time" v={clock(d.at)} mono />
      </Section>

      <Section title="Important features">
        <div className="flex flex-col gap-3 pt-1">
          {d.features.map((f) => (
            <div key={f.name} className="flex items-center gap-4">
              <span className="font-mono text-[10.5px] text-[#62665F] w-[178px] shrink-0 truncate">
                {f.name}
              </span>
              <span className="flex-1 h-[3px] bg-[#E8E8D8] rounded-full overflow-hidden">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(f.weight / 0.31) * 100}%`, background: colour }}
                />
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-[#8A8E86] w-9 text-right">
                {f.weight.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Timeline">
        <ol className="flex flex-col">
          {FLOW.map((step, i) => (
            <li key={step} className="flex gap-4 items-start">
              <div className="flex flex-col items-center pt-[7px]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: colour }} />
                {i < FLOW.length - 1 && <span className="w-px h-7 bg-[#DCDDCB]" />}
              </div>
              <span className="text-[13px] text-[#62665F] leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Kairo recommends">
        <div className="flex flex-wrap gap-2 pt-1">
          {(RESPONSES[d.attack].length ? RESPONSES[d.attack] : ["No action required"]).map((r) => (
            <button
              key={r}
              onClick={() => onStatus(d.id, "investigating")}
              className="btn-pill-paper !text-[12px] !py-2"
            >
              {r}
            </button>
          ))}
        </div>
        {/* §12 of the journey: this project simulates the response. Say so. */}
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8E86]">
          Responses are recorded, not executed
        </p>
      </Section>

      <Section title="Resolution" last>
        <div className="flex flex-wrap gap-2 pt-1">
          {(["acknowledged", "resolved", "false-positive"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => onStatus(d.id, s)}
              className={`btn-pill-paper !text-[12px] !py-2 ${
                d.status === s ? "!border-[#171917] !bg-[#F4F2E2]" : ""
              }`}
            >
              {s.replace("-", " ")}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-[#62665F]">
          Your verdict becomes a label. Confirmed detections and false positives feed the
          validated pool the next model trains on.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`px-8 py-7 ${last ? "" : "border-b border-[#DCDDCB]"}`}>
      <h3 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86] mb-4">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-[#E8E8D8] last:border-0">
      <span className="text-[13px] text-[#8A8E86]">{k}</span>
      <span className={`${mono ? "font-mono text-[11.5px] tabular-nums" : "text-[13.5px]"} text-[#171917]`}>
        {v}
      </span>
    </div>
  );
}
