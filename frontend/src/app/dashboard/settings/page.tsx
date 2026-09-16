"use client";

import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { useConsole } from "@/components/dashboard/DemoProvider";

/* Steps 2 and 3 of the user journey: name the organisation, add the offices,
   add the sources under each. Everything else in the console is scoped by what
   is created here. */

export default function SettingsPage() {
  const { org, setOrg, offices, addOffice, removeOffice, addSource, removeSource, allDetections } =
    useConsole();
  const [newOffice, setNewOffice] = useState("");

  return (
    <div className="px-6 sm:px-10 pb-24 max-w-[760px]">
      <header className="pt-10 pb-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Console // Settings
        </span>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.05] tracking-tight mt-3">
          What Kairo is watching.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] mt-2 max-w-[56ch]">
          Offices and sources defined here are the scope for every other tab.
        </p>
      </header>

      {/* ---- organisation ---- */}
      <section className="border-y border-[#DCDDCB] py-7">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Organisation
        </h2>
        <input
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          aria-label="Organisation name"
          className="mt-4 w-full bg-transparent font-serif text-[30px] sm:text-[34px] leading-none border-b border-[#DCDDCB] pb-3 focus:outline-none focus:border-[#171917] transition-colors duration-200"
        />
        <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#8A8E86] mt-3">
          Shown in the scope bar
        </p>
      </section>

      {/* ---- offices ---- */}
      <section className="py-7 border-b border-[#DCDDCB]">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Offices &amp; sources
        </h2>

        <div className="mt-5 divide-y divide-[#E8E8D8] border-y border-[#E8E8D8]">
          {offices.map((o) => (
            <OfficeRow
              key={o.name}
              name={o.name}
              sources={o.sensors}
              detections={allDetections.filter((d) => d.office === o.name).length}
              onAdd={(s) => addSource(o.name, s)}
              onRemove={(s) => removeSource(o.name, s)}
              onDelete={() => removeOffice(o.name)}
            />
          ))}
          {offices.length === 0 && (
            <p className="py-8 text-[14px] text-[#8A8E86]">No offices yet.</p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addOffice(newOffice);
            setNewOffice("");
          }}
          className="mt-5 flex items-center gap-3"
        >
          <input
            value={newOffice}
            onChange={(e) => setNewOffice(e.target.value)}
            placeholder="Add an office"
            aria-label="New office name"
            className="flex-1 bg-transparent font-serif text-[20px] border-b border-[#DCDDCB] pb-2 placeholder:text-[#C9CBBE] focus:outline-none focus:border-[#171917] transition-colors duration-200"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#171917] text-[#FFFFEB] text-[13px] px-4 py-2 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </form>
      </section>

      {/* ---- what is deliberately not here ---- */}
      <section className="py-7">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#8A8E86]">
          Not here yet
        </h2>
        <p className="text-[14px] leading-relaxed text-[#62665F] mt-3 max-w-[54ch]">
          Users, roles and API keys belong to the real account system, not to this fixture layer.
          They land when the console is wired to the API.
        </p>
      </section>
    </div>
  );
}

function OfficeRow({
  name,
  sources,
  detections,
  onAdd,
  onRemove,
  onDelete,
}: {
  name: string;
  sources: string[];
  detections: number;
  onAdd: (s: string) => void;
  onRemove: (s: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="py-6">
      <div className="flex items-baseline gap-4">
        <h3 className="font-serif text-[24px] leading-none">{name}</h3>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86]">
          {detections} detection{detections === 1 ? "" : "s"}
        </span>
        <button
          onClick={onDelete}
          className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] hover:text-[#E11D48] transition-colors duration-200"
          title="History is kept — only the office is removed"
        >
          Remove office
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {sources.map((s) => (
          <span
            key={s}
            className="group inline-flex items-center gap-2 rounded-full border border-[#DCDDCB] pl-3 pr-2 py-1.5 font-mono text-[11px]"
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
        {sources.length === 0 && (
          <span className="font-mono text-[11px] text-[#C9CBBE]">No sources</span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(draft);
          setDraft("");
        }}
        className="mt-4 flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Router-03"
          aria-label={`Add a source to ${name}`}
          className="w-[170px] bg-transparent font-mono text-[11.5px] border-b border-[#DCDDCB] pb-1.5 placeholder:text-[#C9CBBE] focus:outline-none focus:border-[#171917] transition-colors duration-200"
        />
        <button
          type="submit"
          className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#62665F] hover:text-[#171917] transition-colors duration-200"
        >
          Add source
        </button>
      </form>
    </div>
  );
}
