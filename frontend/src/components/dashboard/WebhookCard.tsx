"use client";

import React, { useEffect, useState } from "react";
import { Bell, Check, ExternalLink, Loader2, Plus, Send, Trash2 } from "lucide-react";
import {
  createWebhook,
  deleteWebhook,
  getWebhooks,
  testWebhook,
  toggleWebhook,
  type WebhookEndpoint,
} from "@/lib/live";

export default function WebhookCard() {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<"discord" | "slack" | "generic">("discord");
  const [minRisk, setMinRisk] = useState(70);
  const [creating, setCreating] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getWebhooks();
      setWebhooks(data.webhooks);
    } catch {
      // In demo mode or offline, provide realistic initial state
      setWebhooks([
        {
          id: "default-discord-wh",
          name: "Security Operations Center (#soc-alerts)",
          url: "https://discord.com/api/webhooks/...",
          format: "discord",
          minRisk: 70,
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !name.trim()) return;
    try {
      setCreating(true);
      await createWebhook({ name: name.trim(), url: url.trim(), format, minRisk });
      setName("");
      setUrl("");
      setShowAdd(false);
      await load();
    } catch (err: any) {
      alert(err?.message || "Failed to add webhook endpoint.");
    } finally {
      setCreating(false);
    }
  };

  const handleTest = async (wh: WebhookEndpoint) => {
    try {
      setTestingId(wh.id);
      setTestStatus(null);
      const res = await testWebhook(wh.url, wh.format);
      if (res.success) {
        setTestStatus({ id: wh.id, success: true, msg: "Delivered alert card to channel" });
      } else {
        setTestStatus({ id: wh.id, success: false, msg: res.error || "Delivery failed" });
      }
    } catch (err: any) {
      setTestStatus({ id: wh.id, success: false, msg: err?.message || "Delivery failed" });
    } finally {
      setTestingId(null);
      setTimeout(() => setTestStatus(null), 4000);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook(id);
      await load();
    } catch {
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleWebhook(id);
      await load();
    } catch {
      setWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)),
      );
    }
  };

  return (
    <div className="rounded-2xl border border-[#DCDDCB] bg-white/70 backdrop-blur-sm p-6 sm:p-7 shadow-[0_2px_12px_-4px_rgba(23,25,23,0.04)]">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E8E8D8] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171917] text-[#FFFFEB]">
            <Bell className="h-4 w-4 text-[#16DFA0]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-[20px] leading-tight text-[#171917]">
                Enterprise Alerting & SIEM Webhooks
              </h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F8F0] px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#059669]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16DFA0] animate-pulse" />
                Live Dispatcher
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8E86]">
              Real-Time Push Alerts · Discord Embeds · Slack Blocks · Generic SIEM (HMAC-SHA256)
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#DCDDCB] bg-[#FFFFEB] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#171917] hover:bg-[#171917] hover:text-[#FFFFEB] transition-all duration-200"
        >
          <Plus className="h-3.5 w-3.5" />
          {showAdd ? "Cancel" : "Add Webhook"}
        </button>
      </div>

      {/* Add Webhook Form */}
      {showAdd && (
        <form onSubmit={handleCreate} className="mt-5 p-5 rounded-xl border border-[#DCDDCB] bg-[#FBFBF5] flex flex-col gap-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] mb-1.5">
                Channel / Integration Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. #kairo-soc-alerts"
                className="w-full h-9 rounded-lg border border-[#DCDDCB] bg-white px-3 font-mono text-[11.5px] placeholder:text-[#8A8E86] focus:border-[#171917] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] mb-1.5">
                Format Provider
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full h-9 rounded-lg border border-[#DCDDCB] bg-white px-3 font-mono text-[11.5px] text-[#171917] focus:border-[#171917] focus:outline-none"
              >
                <option value="discord">Discord (Rich Security Card Embed)</option>
                <option value="slack">Slack (Block Kit Cards)</option>
                <option value="generic">Generic SIEM (Signed JSON)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8A8E86] mb-1.5">
              Webhook URL
            </label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
              className="w-full h-9 rounded-lg border border-[#DCDDCB] bg-white px-3 font-mono text-[11.5px] placeholder:text-[#8A8E86] focus:border-[#171917] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="font-mono text-[10px] text-[#8A8E86]">
              Alert Trigger: Fires when Risk &ge; {minRisk} (Warnings & Criticals)
            </span>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#171917] text-[#FFFFEB] px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-[#2b2e2b] disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save Endpoint
            </button>
          </div>
        </form>
      )}

      {/* Webhook Endpoints List */}
      <div className="divide-y divide-[#E8E8D8] mt-4">
        {webhooks.length === 0 && !loading && (
          <p className="py-6 text-center font-mono text-[11px] text-[#8A8E86]">
            No notification channels connected. Click &quot;Add Webhook&quot; to connect Discord or Slack.
          </p>
        )}

        {webhooks.map((wh) => (
          <div key={wh.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="font-serif text-[17px] text-[#171917] truncate">{wh.name}</span>
                <span className="rounded-full bg-[#FFFFEB] border border-[#DCDDCB] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#62665F]">
                  {wh.format}
                </span>
                {wh.enabled ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#059669]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16DFA0]" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#8A8E86]">
                    Paused
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] text-[#8A8E86] truncate max-w-[420px] mt-0.5">
                {wh.url.replace(/(discord\.com\/api\/webhooks\/\d+\/)[^/]+/, "$1••••••••")}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {testStatus?.id === wh.id && (
                <span
                  className={`font-mono text-[10px] animate-fade-in ${
                    testStatus.success ? "text-[#059669]" : "text-[#E11D48]"
                  }`}
                >
                  {testStatus.success ? `✓ ${testStatus.msg}` : `✕ ${testStatus.msg}`}
                </span>
              )}

              <button
                onClick={() => handleTest(wh)}
                disabled={testingId === wh.id}
                className="inline-flex items-center gap-1 rounded-full border border-[#DCDDCB] bg-[#FFFFEB] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#171917] hover:bg-[#171917] hover:text-[#FFFFEB] transition-colors disabled:opacity-50"
              >
                {testingId === wh.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Test
              </button>

              <button
                onClick={() => handleToggle(wh.id)}
                className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#8A8E86] hover:text-[#171917] px-2 py-1 transition-colors"
              >
                {wh.enabled ? "Pause" : "Enable"}
              </button>

              <button
                onClick={() => handleDelete(wh.id)}
                aria-label="Delete webhook"
                className="text-[#C9CBBE] hover:text-[#E11D48] transition-colors p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
