"use client";

import React, { useEffect, useState } from "react";
import { Download, FileText, Filter, ShieldCheck } from "lucide-react";
import { getAuditLogs, type AuditLogItem } from "@/lib/live";

export default function AuditLogCard() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterAction, setFilterAction] = useState<string>("all");

  const load = async () => {
    try {
      setLoading(true);
      const res = await getAuditLogs({
        action: filterAction === "all" ? undefined : filterAction,
        limit: 25,
      });
      setLogs(res.logs);
      setTotal(res.total);
    } catch {
      // Realistic initial state for demo mode
      setLogs([
        {
          id: "log-1",
          actorEmail: "analyst@kairo.io",
          actorRole: "analyst",
          action: "IPS_QUARANTINE_ENFORCED",
          resourceType: "QuarantineRule",
          resourceId: "rule-198-51-100-99",
          details: { sourceIp: "198.51.100.99", risk: 94, driver: "iptables" },
          ipAddress: "10.0.4.12",
          createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        },
        {
          id: "log-2",
          actorEmail: "admin@kairo.io",
          actorRole: "admin",
          action: "SENSOR_MINTED",
          resourceType: "Sensor",
          resourceId: "sensor-blr-01",
          details: { name: "Bangalore-DC-Sensor" },
          ipAddress: "10.0.4.10",
          createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
        },
        {
          id: "log-3",
          actorEmail: "analyst@kairo.io",
          actorRole: "analyst",
          action: "ALERT_TRIAGE_MUTATED",
          resourceType: "Detection",
          resourceId: "flow-ddos-442",
          details: { newStatus: "investigating" },
          ipAddress: "10.0.4.12",
          createdAt: new Date(Date.now() - 1000 * 60 * 115).toISOString(),
        },
      ]);
      setTotal(3);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filterAction]);

  const handleExportCsv = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    window.open(`${apiBase}/audit/export`, "_blank");
  };

  const actionColour = (action: string) => {
    if (action.includes("QUARANTINE")) return "text-[#E11D48] bg-[#FFE4E6]";
    if (action.includes("SENSOR")) return "text-[#059669] bg-[#E8F8F0]";
    if (action.includes("ALERT")) return "text-[#D97706] bg-[#FEF3C7]";
    return "text-[#62665F] bg-[#F4F4E8]";
  };

  return (
    <div className="rounded-2xl border border-[#DCDDCB] bg-white/70 backdrop-blur-sm p-6 sm:p-7 shadow-[0_2px_12px_-4px_rgba(23,25,23,0.04)]">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E8E8D8] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171917] text-[#FFFFEB]">
            <ShieldCheck className="h-4 w-4 text-[#16DFA0]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-[20px] leading-tight text-[#171917]">
                SOC 2 Immutable Audit Trail
              </h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F8F0] px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#059669]">
                Append-Only
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8E86]">
              Tamper-Resistant Decision Log · Cryptographic Integrity · Export Ready
            </p>
          </div>
        </div>

        {/* Export CSV Button */}
        <button
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#DCDDCB] bg-[#FFFFEB] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#171917] hover:bg-[#171917] hover:text-[#FFFFEB] transition-all duration-200"
        >
          <Download className="h-3.5 w-3.5" />
          Export Audit CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-[#8A8E86]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8E86]">
            Filter:
          </span>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="h-7 rounded-md border border-[#DCDDCB] bg-white px-2.5 font-mono text-[10.5px] text-[#171917] focus:outline-none"
          >
            <option value="all">All Events ({total})</option>
            <option value="IPS_QUARANTINE_ENFORCED">Quarantine Enforced</option>
            <option value="IPS_QUARANTINE_RELEASED">Quarantine Released</option>
            <option value="SENSOR_MINTED">Sensor Minted</option>
            <option value="SENSOR_REVOKED">Sensor Revoked</option>
            <option value="ALERT_TRIAGE_MUTATED">Alert Triage</option>
          </select>
        </div>
        <span className="font-mono text-[10px] text-[#8A8E86]">
          Showing {logs.length} of {total} immutable records
        </span>
      </div>

      {/* Audit Log Stream */}
      <div className="divide-y divide-[#E8E8D8] mt-2 max-h-[360px] overflow-y-auto pr-1">
        {logs.map((log) => (
          <div key={log.id} className="py-3.5 flex flex-wrap items-baseline justify-between gap-3 text-[12.5px]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${actionColour(log.action)}`}>
                  {log.action.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[11px] text-[#171917] font-medium">
                  {log.actorEmail}
                </span>
                <span className="rounded bg-[#F4F4E8] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-[#62665F]">
                  {log.actorRole}
                </span>
                {log.ipAddress && (
                  <span className="font-mono text-[9.5px] text-[#8A8E86]">
                    from {log.ipAddress}
                  </span>
                )}
              </div>

              {log.details && (
                <p className="font-mono text-[10.5px] text-[#62665F] mt-1 truncate">
                  {JSON.stringify(log.details)}
                </p>
              )}
            </div>

            <span className="shrink-0 font-mono text-[10px] text-[#8A8E86] tabular-nums">
              {new Date(log.createdAt).toISOString().replace("T", " ").slice(0, 19)} UTC
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
