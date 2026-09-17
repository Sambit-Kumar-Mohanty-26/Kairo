"use client";

import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { useConsole } from "@/components/dashboard/DemoProvider";
import FleetPanel from "@/components/dashboard/FleetPanel";
import { renameOrg } from "@/lib/live";

/* Steps 2 and 3 of the user journey: name the organisation, add the offices,
   add the sources under each. Everything else in the console is scoped by what
   is created here — so the page is laid out like the rail that it feeds:
   numbered in the margin, hairlines instead of cards.

   One page, two feeds. In Test Mode it edits fixtures that live in the tab; in
   Live Mode it edits the real estate and mints the sensor keys. Deliberately
   not two pages: the operator who clicked through the demo should find the real
   thing where the demo was. */

export default function SettingsPage() {
  const {
    org,
    setOrg,
    offices,
    addOffice,
    removeOffice,
    addSource,
    removeSource,
    allDetections,
    mode,
    refreshLive,
  } = useConsole();
  const [newOffice, setNewOffice] = useState("");
  // Non-null only while the field is being edited, so the authoritative name
  // shows the rest of the time — including after a rename that failed.
  const [draft, setDraft] = useState<string | null>(null);
  const live = mode === "live";

  // On blur, not per keystroke: in Live Mode a keystroke would be a PATCH.
  const commitOrg = () => {
    const next = (draft ?? "").trim();
    setDraft(null);
    if (!next || next === org) return;
    if (live) void renameOrg(next).finally(refreshLive);
    else setOrg(next);
  };

  const sources = offices.reduce((n, o) => n + o.sensors.length, 0);

  return (
    <div className="px-6 sm:px-10 pb-24 max-w-[940px]">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // Settings
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          {live ? "Connect your network." : "What Kairo is watching."}
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[56ch]">
          {live
            ? "Offices, subnets and sensors. A detection is attributed to exactly this tree, which is why it is built before anything is watched."
            : "Offices and sources defined here are the scope for every other tab."}
        </p>
      </header>

      {/* ---- coverage ---- */}
      <section className="rounded-2xl sm:rounded-3xl bg-[#111413] text-white border border-white/[0.08] shadow-[0_16px_36px_-6px_rgba(17,20,19,0.16)] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.2em]">Coverage</span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#8A8E86]">
            {live ? "Live Mode · your estate" : "Test Mode · fixture feed"}
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/[0.08]">
          <Figure v={offices.length} k="Offices" />
          <Figure
            v={sources}
            k={live ? "Sensors" : "Sources"}
            tone={sources === 0 ? "#FBBF24" : undefined}
          />
          <Figure v={allDetections.length} k="Detections" />
        </div>
      </section>

      {/* ---- organisation ---- */}
      <section className="mt-14">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Organisation
        </h2>
        <div className="mt-4 flex items-baseline gap-4 border-b border-[#DCDDCB] pb-3">
          <span className="font-mono text-[10px] tracking-[0.14em] text-[#8A8E86] shrink-0">
            00
          </span>
          <input
            value={draft ?? org}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitOrg}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label="Organisation name"
            className="flex-1 min-w-0 bg-transparent font-serif text-[30px] sm:text-[34px] leading-none focus:outline-none"
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#C9CBBE] shrink-0 hidden sm:block">
            {live ? "On every alert. Saved when you click away" : "Shown in the scope bar"}
          </span>
        </div>
      </section>

      {/* ---- offices ---- */}
      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
            {live ? "Offices, networks & sensors" : "Offices & sources"}
          </h2>
          {!live && (
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#C9CBBE]">
              {offices.length} office{offices.length === 1 ? "" : "s"} · {sources} source
              {sources === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {live && (
          <div className="mt-5">
            <FleetPanel />
          </div>
        )}

        {!live && (
          <div className="mt-5 divide-y divide-[#E8E8D8] border-y border-[#DCDDCB]">
            {offices.map((o, i) => (
              <OfficeRow
                key={o.name}
                n={String(i + 1).padStart(2, "0")}
                name={o.name}
                sources={o.sensors}
                detections={allDetections.filter((d) => d.office === o.name).length}
                onAdd={(s) => addSource(o.name, s)}
                onRemove={(s) => removeSource(o.name, s)}
                onDelete={() => removeOffice(o.name)}
              />
            ))}
            {offices.length === 0 && (
              <p className="py-10 text-[14px] text-[#8A8E86]">
                No offices yet. Kairo has nothing to scope to.
              </p>
            )}

            {/* the new row sits in the list, in the position it will take */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addOffice(newOffice);
                setNewOffice("");
              }}
              className="flex items-center gap-4 py-5"
            >
              <span className="font-mono text-[10px] tracking-[0.14em] text-[#DCDDCB] shrink-0">
                {String(offices.length + 1).padStart(2, "0")}
              </span>
              <input
                value={newOffice}
                onChange={(e) => setNewOffice(e.target.value)}
                placeholder="New office"
                aria-label="New office name"
                className="flex-1 min-w-0 bg-transparent font-serif text-[24px] leading-none placeholder:text-[#C9CBBE] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newOffice.trim()}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#171917] text-[#FFFFEB] text-[13px] px-4 py-2 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Plus className="w-3.5 h-3.5" />
                Add office
              </button>
            </form>
          </div>
        )}
      </section>

      {/* ---- what is deliberately not here ---- */}
      <section className="mt-12">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          {live ? "What the model covers" : "Not here yet"}
        </h2>
        {live ? (
          <p className="text-[14px] leading-relaxed text-[#62665F] mt-3 max-w-[58ch]">
            The cascade was trained on CICIDS2017 and scores 99.45% macro-F1 on held-out flows from
            it. On a different capture it does not hold: cross-dataset macro-F1 is 0.32. Treat Live
            Mode as a detector for traffic that resembles that benchmark, not as a guarantee — and
            triage every verdict, because every resolved and false-positive label is what the next
            model is trained on. Per-user roles and SSO are not built yet.
          </p>
        ) : (
          <p className="text-[14px] leading-relaxed text-[#62665F] mt-3 max-w-[54ch]">
            Nothing here leaves the tab. Test Mode&apos;s offices, sources and detections are
            fixtures that reset with the session — switch to Live Mode to connect a real network.
          </p>
        )}
      </section>
    </div>
  );
}

function OfficeRow({
  n,
  name,
  sources,
  detections,
  onAdd,
  onRemove,
  onDelete,
}: {
  n: string;
  name: string;
  sources: string[];
  detections: number;
  onAdd: (s: string) => void;
  onRemove: (s: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="group flex gap-4 py-6">
      <span className="font-mono text-[10px] tracking-[0.14em] text-[#8A8E86] shrink-0 mt-[7px]">
        {n}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-4">
          <h3 className="font-serif text-[26px] leading-none truncate">{name}</h3>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] shrink-0">
            {detections} detection{detections === 1 ? "" : "s"}
          </span>
          <button
            onClick={onDelete}
            className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#C9CBBE] hover:text-[#E11D48] transition-colors duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="History is kept — only the office is removed"
          >
            Remove
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sources.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-2 rounded-full border border-[#DCDDCB] bg-[#FFFFEB] pl-3.5 pr-2 py-1.5 font-mono text-[11px]"
            >
              {s}
              <button
                onClick={() => onRemove(s)}
                aria-label={`Remove ${s}`}
                className="text-[#C9CBBE] hover:text-[#E11D48] transition-colors duration-200"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* the add control is the same pill as the things it creates */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAdd(draft);
              setDraft("");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#DCDDCB] pl-3 pr-3 py-1.5 focus-within:border-[#171917] transition-colors duration-200"
          >
            <Plus className="w-3 h-3 text-[#8A8E86]" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add source"
              aria-label={`Add a source to ${name}`}
              className="w-[92px] bg-transparent font-mono text-[11px] placeholder:text-[#C9CBBE] focus:outline-none"
            />
          </form>

          {sources.length === 0 && (
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#D97706]">
              Nothing monitored here
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Figure({ v, k, tone }: { v: number; k: string; tone?: string }) {
  return (
    <div className="p-7">
      <div className="font-serif text-[40px] leading-none tabular-nums" style={{ color: tone }}>
        {v}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86] mt-3">{k}</div>
    </div>
  );
}
