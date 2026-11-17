"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Check, Clock, Copy, Database, HardDrive, Info, Plus, Radio, Server, ShieldAlert, X } from "lucide-react";
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
  type Sensor,
} from "@/lib/live";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function FleetPanel() {
  const { refreshLive, live } = useConsole();
  const [offices, setOffices] = useState<FleetOffice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ sensor: string; key: string } | null>(null);
  const [inspectingSensor, setInspectingSensor] = useState<{ sensor: Sensor; officeName: string; networkName: string; cidr: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const data = await fleet();
      setOffices(data.offices);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the fleet.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, live.sensorsLive, live.sensorsTotal]);

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

  const allSensors = offices.flatMap((o) =>
    o.networks.flatMap((n) =>
      n.sensors.map((s) => ({
        ...s,
        officeName: o.name,
        networkName: n.name,
        cidr: n.cidr,
      })),
    ),
  );

  const filteredCount = allSensors.filter((s) => {
    if (statusFilter === "all") return true;
    return (s.status ?? (s.live ? "online" : "offline")) === statusFilter;
  }).length;

  return (
    <div>
      {error && (
        <p className="mb-6 border-l-2 border-[#E11D48] pl-3 font-mono text-[10.5px] text-[#E11D48]">
          {error}
        </p>
      )}

      {minted && <MintedKey sensor={minted.sensor} value={minted.key} onDone={() => setMinted(null)} />}

      {/* Filter and stats pill bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#DCDDCB] pb-4">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px]">
          <span className="text-[#8A8E86] uppercase tracking-[0.16em] mr-2">Status:</span>
          {(["all", "online", "degraded", "offline", "pending"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-full px-3 py-1 uppercase tracking-[0.14em] transition-colors ${
                statusFilter === st
                  ? "bg-[#171917] text-[#FFFFEB]"
                  : "bg-transparent text-[#62665F] hover:bg-[#E8E8D8]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8E86]">
          {allSensors.length} total · {allSensors.filter((s) => s.status === "online" || s.live).length} online ·{" "}
          {allSensors.filter((s) => s.status === "degraded").length} degraded
        </div>
      </div>

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
            statusFilter={statusFilter}
            onInspectSensor={(sensor, officeName, networkName, cidr) =>
              setInspectingSensor({ sensor, officeName, networkName, cidr })
            }
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

      {inspectingSensor && (
        <SensorDetailDrawer
          data={inspectingSensor}
          onClose={() => setInspectingSensor(null)}
          onRevoke={async (id) => {
            await act(() => revokeSensor(id));
            setInspectingSensor(null);
          }}
        />
      )}
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

function MintedKey({ sensor, value, onDone }: { sensor: string; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const command = [
    "pip install scapy",
    `export KAIRO_URL=${API}`,
    `export KAIRO_SENSOR_KEY=${value}`,
    "sudo -E python agent/agent.py --interface eth0",
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
          Copy this now. Only a SHA-256 hash of the key is stored, so this is the one time it can be read —
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
            Needs root (CAP_NET_RAW) for raw packet sniffing
          </span>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "online":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#059669]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
          ONLINE
        </span>
      );
    case "degraded":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#D97706]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
          DEGRADED
        </span>
      );
    case "offline":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#8A8E86]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8A8E86]" />
          OFFLINE
        </span>
      );
    case "revoked":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#E11D48]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48]" />
          REVOKED
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#3B82F6]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
          PENDING
        </span>
      );
  }
}

function SensorDetailDrawer({
  data,
  onClose,
  onRevoke,
}: {
  data: { sensor: Sensor; officeName: string; networkName: string; cidr: string };
  onClose: () => void;
  onRevoke: (id: string) => Promise<void>;
}) {
  const { sensor, officeName, networkName, cidr } = data;
  const status = sensor.status ?? (sensor.live ? "online" : "offline");
  const [revoking, setRevoking] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity">
      <div className="relative w-full max-w-lg bg-[#111413] text-white border-l border-white/[0.08] shadow-2xl p-6 sm:p-8 overflow-y-auto">
        <div className="flex items-center justify-between pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <StatusBadge status={status} />
              <span className="font-mono text-[10px] text-[#8A8E86]">v{sensor.version ?? "0.2.0"}</span>
            </div>
            <h2 className="font-serif text-[28px] mt-1">{sensor.name}</h2>
            <p className="font-mono text-[11px] text-[#8A8E86]">
              {officeName} // {networkName} ({cidr})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white transition-colors rounded-full"
            aria-label="Close sensor inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diagnostic Explanation Banner */}
        <div className="my-6 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-[#16DFA0]" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#16DFA0]">
              Operational Diagnosis
            </span>
          </div>
          <p className="text-[13.5px] leading-relaxed text-white/80">
            {sensor.troubleshooting ??
              (status === "online"
                ? "Sensor is active and communicating normally with Kairo."
                : status === "degraded"
                ? "Sensor is reachable but experiencing queue or interface issues."
                : "No heartbeat received within 2 minutes. The sensor daemon may be offline.")}
          </p>
          {sensor.recent_warning && (
            <div className="mt-2 text-[12px] text-[#FBBF24] font-mono flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Warning: {sensor.recent_warning}</span>
            </div>
          )}
        </div>

        {/* Telemetry Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6 font-mono">
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-[9.5px] uppercase text-[#8A8E86] block">Packets Observed</span>
            <span className="text-[20px] font-serif text-[#FFFFEB] tabular-nums">
              {(sensor.packets_observed ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-[9.5px] uppercase text-[#8A8E86] block">Flows Extracted</span>
            <span className="text-[20px] font-serif text-[#FFFFEB] tabular-nums">
              {(sensor.flows_extracted ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-[9.5px] uppercase text-[#8A8E86] block">Pending Batches</span>
            <span
              className={`text-[20px] font-serif tabular-nums ${
                (sensor.pending_batches ?? 0) > 0 ? "text-[#FBBF24]" : "text-[#FFFFEB]"
              }`}
            >
              {sensor.pending_batches ?? 0}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="text-[9.5px] uppercase text-[#8A8E86] block">Queue Disk Usage</span>
            <span className="text-[20px] font-serif text-[#FFFFEB] tabular-nums">
              {Math.round(((sensor.queue_bytes ?? 0) / 1024 / 1024) * 10) / 10} MB
            </span>
          </div>
        </div>

        {/* Hardware & Activity Timestamps */}
        <div className="space-y-3 border-t border-white/[0.08] pt-6 font-mono text-[11.5px]">
          <div className="flex justify-between text-[#8A8E86]">
            <span>Capture Interface:</span>
            <span className="text-white">{sensor.interface ?? "default"}</span>
          </div>
          <div className="flex justify-between text-[#8A8E86]">
            <span>Capture Engine State:</span>
            <span className="text-white capitalize">{sensor.capture_status ?? "idle"}</span>
          </div>
          <div className="flex justify-between text-[#8A8E86]">
            <span>Last Heartbeat:</span>
            <span className="text-white">
              {sensor.last_heartbeat_at ? new Date(sensor.last_heartbeat_at).toLocaleTimeString() : "Never"}
            </span>
          </div>
          <div className="flex justify-between text-[#8A8E86]">
            <span>Last Telemetry Upload:</span>
            <span className="text-white">
              {sensor.last_upload_at ? new Date(sensor.last_upload_at).toLocaleTimeString() : "Never"}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-8 border-t border-white/[0.08] pt-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-full px-5 py-2 text-[13px] bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors"
          >
            Close
          </button>
          {status !== "revoked" && (
            <button
              disabled={revoking}
              onClick={async () => {
                if (confirm(`Revoke sensor '${sensor.name}'? Existing detections will be preserved.`)) {
                  setRevoking(true);
                  await onRevoke(sensor.id);
                }
              }}
              className="rounded-full px-4 py-2 text-[12px] font-mono uppercase tracking-[0.14em] text-[#FB7185] hover:bg-[#E11D48]/20 transition-colors"
            >
              Revoke Sensor
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OfficeBlock({
  n,
  office,
  statusFilter,
  onInspectSensor,
  onDelete,
  onAddNetwork,
  onDeleteNetwork,
  onAddSensor,
  onRevoke,
}: {
  n: string;
  office: FleetOffice;
  statusFilter: string;
  onInspectSensor: (sensor: Sensor, officeName: string, networkName: string, cidr: string) => void;
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
          {office.networks.map((net) => {
            const filteredSensors = net.sensors.filter((s) => {
              if (statusFilter === "all") return true;
              return (s.status ?? (s.live ? "online" : "offline")) === statusFilter;
            });

            return (
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
                  {filteredSensors.map((s) => {
                    const st = s.status ?? (s.live ? "online" : "offline");
                    const color =
                      st === "online"
                        ? "#059669"
                        : st === "degraded"
                        ? "#D97706"
                        : st === "revoked"
                        ? "#E11D48"
                        : st === "pending"
                        ? "#3B82F6"
                        : "#8A8E86";

                    return (
                      <button
                        key={s.id}
                        onClick={() => onInspectSensor(s, office.name, net.name, net.cidr)}
                        className="inline-flex items-center gap-2 rounded-full border border-[#DCDDCB] bg-[#FFFFEB] hover:bg-white transition-all pl-3 pr-2.5 py-1.5 font-mono text-[11px] cursor-pointer shadow-sm hover:shadow"
                        title="Click to view sensor health & diagnostic telemetry"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium text-[#171917]">{s.name}</span>
                        <span className="text-[9.5px] uppercase text-[#8A8E86]">({st})</span>
                      </button>
                    );
                  })}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const el = e.currentTarget.elements.namedItem("s") as HTMLInputElement;
                      if (el.value.trim()) {
                        onAddSensor(net.id, el.value.trim());
                        el.value = "";
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#DCDDCB] px-3 py-1.5 focus-within:border-[#171917] focus-within:bg-[#FFFFF5] transition-colors duration-200"
                  >
                    <Plus className="w-3 h-3 text-[#8A8E86]" />
                    <input
                      name="s"
                      placeholder="Add sensor"
                      aria-label={`Register a sensor on ${net.name}`}
                      className="w-[96px] bg-transparent font-mono text-[11px] placeholder:text-[#C9CBBE] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A8E86] hover:text-[#171917] bg-[#EAEAD8]/60 hover:bg-[#EAEAD8] px-1.5 py-0.5 rounded transition-colors"
                      title="Press Enter or click to add sensor"
                    >
                      Add ↵
                    </button>
                  </form>

                  {net.sensors.length === 0 && (
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#D97706]">
                      No sensor — nothing is being watched here
                    </span>
                  )}
                </div>
              </div>
            );
          })}

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
              className="bg-transparent text-[13.5px] placeholder:text-[#C9CBBE] focus:outline-none"
            />
            <input
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              placeholder="CIDR, e.g. 10.20.0.0/16"
              aria-label={`CIDR block for network in ${office.name}`}
              className="bg-transparent font-mono text-[11px] placeholder:text-[#C9CBBE] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!name.trim() || !cidr.trim()}
              className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] hover:text-[#171917] transition-colors duration-200 disabled:opacity-30 disabled:pointer-events-none"
            >
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
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const v = val.trim();
        if (!v || busy) return;
        setBusy(true);
        try {
          await onSubmit(v);
          setVal("");
        } finally {
          setBusy(false);
        }
      }}
      className="flex items-center gap-4 py-5"
    >
      <span className="font-mono text-[10px] tracking-[0.14em] text-[#DCDDCB] shrink-0">{n}</span>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="flex-1 min-w-0 bg-transparent font-serif text-[24px] leading-none placeholder:text-[#C9CBBE] focus:outline-none"
      />
      <button
        type="submit"
        disabled={!val.trim() || busy}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#171917] text-[#FFFFEB] text-[13px] px-4 py-2 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-30 disabled:pointer-events-none"
      >
        <Plus className="w-3.5 h-3.5" />
        {label}
      </button>
    </form>
  );
}
