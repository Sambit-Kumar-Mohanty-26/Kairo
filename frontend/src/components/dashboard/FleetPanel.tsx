"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Plus, X } from "lucide-react";
import { useConsole } from "./DemoProvider";
import {
  createNetwork,
  createOffice,
  createSensor,
  deleteNetwork,
  deleteOffice,
  fleet,
  revokeSensor,
  type FleetOffice,
} from "@/lib/live";

/* The connect path, end to end: office, then network, then sensor, then the
   one command that starts reporting. It is laid out as the three levels it
   creates rather than as a form, because the shape of the estate is the thing
   being taught — a detection that cannot say which office and which subnet is
   not worth much.

   Test Mode's Settings keeps its fixture editor. This is the same page in Live
   Mode, against the real fleet. */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function FleetPanel() {
  const { refreshLive, live } = useConsole();
  const [offices, setOffices] = useState<FleetOffice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The key, shown once. It is never stored in the clear, so there is no
  // second chance to read it and the panel says so plainly.
  const [minted, setMinted] = useState<{ sensor: string; key: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setOffices((await fleet()).offices);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the fleet.");
    }
  }, []);

  // Reloaded when the dashboard's own poll sees the fleet change, so a sensor
  // that just started reporting turns green here too. Without it this tree
  // keeps whatever it was told at mount while the rail beside it says "1 of 1
  // live" — one screen, two answers.
  useEffect(() => {
    void load();
  }, [load, live.sensorsLive, live.sensorsTotal]);

  /** Every mutation ends the same way: reload the fleet, and nudge the live
   *  poll so the dashboard agrees with this page immediately. */
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
      refreshLive();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
  };

  if (!offices) {
    return (
      <p className="py-10 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8E86]">
        {error ?? "Loading the fleet…"}
      </p>
    );
  }

  const sensors = offices.flatMap((o) => o.networks.flatMap((n) => n.sensors));

  return (
    <div>
      {error && (
        <p className="mb-6 border-l-2 border-[#E11D48] pl-3 font-mono text-[10.5px] text-[#E11D48]">
          {error}
        </p>
      )}

      {minted && <MintedKey sensor={minted.sensor} value={minted.key} onDone={() => setMinted(null)} />}

      {offices.length === 0 && !minted && (
        <div className="border-y border-[#DCDDCB] py-10">
          <p className="font-serif text-[22px] leading-snug max-w-[40ch]">
            Nothing is connected yet. Three steps, about five minutes.
          </p>
          <ol className="mt-5 flex flex-col gap-2.5 text-[14px] text-[#62665F] max-w-[56ch]">
            <Step n="01" t="Add an office" d="A site. Bhubaneswar, the Mumbai DC, wherever the traffic is." />
            <Step n="02" t="Add a network" d="A subnet in CIDR, like 10.20.0.0/16. This is what attributes a flow to a place." />
            <Step n="03" t="Register a sensor" d="You get a key and one command. Run it on a host that can see the traffic." />
          </ol>
        </div>
      )}

      <div className="divide-y divide-[#E8E8D8] border-y border-[#DCDDCB]">
        {offices.map((o, i) => (
          <OfficeBlock
            key={o.id}
            n={String(i + 1).padStart(2, "0")}
            office={o}
            onDelete={() => act(() => deleteOffice(o.id))}
            onAddNetwork={(name, cidr) => act(() => createNetwork(o.id, name, cidr))}
            onDeleteNetwork={(id) => act(() => deleteNetwork(id))}
            onAddSensor={async (networkId, name) => {
              try {
                const s = await createSensor(networkId, name);
                setMinted({ sensor: s.name, key: s.key });
                await load();
                refreshLive();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not register the sensor.");
              }
            }}
            onRevoke={(id) => act(() => revokeSensor(id))}
          />
        ))}

        <Adder
          n={String(offices.length + 1).padStart(2, "0")}
          placeholder="New office"
          label="Add office"
          onSubmit={(name) => act(() => createOffice(name))}
        />
      </div>

      <p className="mt-5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#C9CBBE]">
        {offices.length} office{offices.length === 1 ? "" : "s"} ·{" "}
        {offices.reduce((n, o) => n + o.networks.length, 0)} network
        {offices.reduce((n, o) => n + o.networks.length, 0) === 1 ? "" : "s"} · {sensors.length} sensor
        {sensors.length === 1 ? "" : "s"} · {sensors.filter((s) => s.live).length} reporting
      </p>
    </div>
  );
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <li className="flex gap-4">
      <span className="font-mono text-[10px] tracking-[0.14em] text-[#C9CBBE] shrink-0 mt-[3px]">{n}</span>
      <span>
        <span className="text-[#171917]">{t}</span> — {d}
      </span>
    </li>
  );
}

/** The one screen in the product that shows a secret. It is deliberately loud,
 *  deliberately blocking, and it tells the truth about being unrecoverable. */
function MintedKey({ sensor, value, onDone }: { sensor: string; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const command = [
    "pip install scapy",
    `export KAIRO_URL=${API}`,
    `export KAIRO_SENSOR_KEY=${value}`,
    "sudo -E python agent.py --interface eth0",
  ].join("\n");

  return (
    <section className="mb-10 rounded-2xl sm:rounded-3xl bg-[#111413] text-white border border-white/[0.08] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#16DFA0]">
          {sensor} registered
        </span>
        <button
          onClick={onDone}
          className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] hover:text-white transition-colors duration-200"
        >
          Done
        </button>
      </div>
      <div className="px-6 py-6">
        <p className="text-[14.5px] leading-relaxed text-white/70 max-w-[58ch]">
          Copy this now. Only a hash of the key is stored, so this is the one time it can be read —
          if it is lost, register a new sensor and revoke this one.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-xl bg-black/40 p-4 font-mono text-[11.5px] leading-relaxed text-[#E8E8D8]">
          {command}
        </pre>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => {
              void navigator.clipboard.writeText(command);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-[#FFFFEB] text-[#171917] text-[13px] px-4 py-2 transition-all duration-200 hover:-translate-y-0.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy command"}
          </button>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86]">
            Needs root — packet capture always does
          </span>
        </div>
      </div>
    </section>
  );
}

function OfficeBlock({
  n,
  office,
  onDelete,
  onAddNetwork,
  onDeleteNetwork,
  onAddSensor,
  onRevoke,
}: {
  n: string;
  office: FleetOffice;
  onDelete: () => void;
  onAddNetwork: (name: string, cidr: string) => void;
  onDeleteNetwork: (id: string) => void;
  onAddSensor: (networkId: string, name: string) => void;
  onRevoke: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [cidr, setCidr] = useState("");

  return (
    <div className="group flex gap-4 py-6">
      <span className="font-mono text-[10px] tracking-[0.14em] text-[#8A8E86] shrink-0 mt-[7px]">{n}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-4">
          <h3 className="font-serif text-[26px] leading-none truncate">{office.name}</h3>
          <button
            onClick={onDelete}
            className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#C9CBBE] hover:text-[#E11D48] transition-colors duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="Removes its networks, sensors and their detections"
          >
            Remove
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {office.networks.map((net) => (
            <div key={net.id} className="border-l border-[#E8E8D8] pl-4">
              <div className="flex items-baseline gap-3">
                <span className="text-[14.5px]">{net.name}</span>
                <span className="font-mono text-[11px] text-[#8A8E86]">{net.cidr}</span>
                <button
                  onClick={() => onDeleteNetwork(net.id)}
                  className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#C9CBBE] hover:text-[#E11D48] transition-colors duration-200"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {net.sensors.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-2 rounded-full border border-[#DCDDCB] bg-[#FFFFEB] pl-3 pr-2 py-1.5 font-mono text-[11px]"
                    title={s.last_seen_at ? `Last reported ${new Date(s.last_seen_at).toLocaleTimeString()}` : "Has never reported"}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.live ? "#059669" : "#D97706" }}
                    />
                    {s.name}
                    <button
                      onClick={() => onRevoke(s.id)}
                      aria-label={`Revoke ${s.name}`}
                      title="Revokes the key. Detections it already reported are kept."
                      className="text-[#C9CBBE] hover:text-[#E11D48] transition-colors duration-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const el = e.currentTarget.elements.namedItem("s") as HTMLInputElement;
                    if (el.value.trim()) {
                      onAddSensor(net.id, el.value.trim());
                      el.value = "";
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#DCDDCB] px-3 py-1.5 focus-within:border-[#171917] transition-colors duration-200"
                >
                  <Plus className="w-3 h-3 text-[#8A8E86]" />
                  <input
                    name="s"
                    placeholder="Add sensor"
                    aria-label={`Register a sensor on ${net.name}`}
                    className="w-[96px] bg-transparent font-mono text-[11px] placeholder:text-[#C9CBBE] focus:outline-none"
                  />
                </form>

                {net.sensors.length === 0 && (
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#D97706]">
                    No sensor — nothing is being watched here
                  </span>
                )}
              </div>
            </div>
          ))}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && cidr.trim()) {
                onAddNetwork(name.trim(), cidr.trim());
                setName("");
                setCidr("");
              }
            }}
            className="flex flex-wrap items-center gap-2 border-l border-dashed border-[#DCDDCB] pl-4"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Network name"
              aria-label={`New network in ${office.name}`}
              className="w-[150px] bg-transparent text-[14px] placeholder:text-[#C9CBBE] focus:outline-none border-b border-[#DCDDCB] focus:border-[#171917] transition-colors duration-200 pb-1"
            />
            <input
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              placeholder="10.20.0.0/16"
              aria-label={`CIDR for the new network in ${office.name}`}
              className="w-[120px] bg-transparent font-mono text-[11.5px] placeholder:text-[#C9CBBE] focus:outline-none border-b border-[#DCDDCB] focus:border-[#171917] transition-colors duration-200 pb-1"
            />
            <button
              type="submit"
              disabled={!name.trim() || !cidr.trim()}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#DCDDCB] text-[12.5px] px-3 py-1.5 transition-all duration-200 hover:border-[#171917] disabled:opacity-30 disabled:pointer-events-none"
            >
              <Plus className="w-3 h-3" />
              Add network
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Adder({
  n,
  placeholder,
  label,
  onSubmit,
}: {
  n: string;
  placeholder: string;
  label: string;
  onSubmit: (v: string) => void;
}) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) {
          onSubmit(v.trim());
          setV("");
        }
      }}
      className="flex items-center gap-4 py-5"
    >
      <span className="font-mono text-[10px] tracking-[0.14em] text-[#DCDDCB] shrink-0">{n}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent font-serif text-[24px] leading-none placeholder:text-[#C9CBBE] focus:outline-none"
      />
      <button
        type="submit"
        disabled={!v.trim()}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#171917] text-[#FFFFEB] text-[13px] px-4 py-2 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-30 disabled:pointer-events-none"
      >
        <Plus className="w-3.5 h-3.5" />
        {label}
      </button>
    </form>
  );
}
