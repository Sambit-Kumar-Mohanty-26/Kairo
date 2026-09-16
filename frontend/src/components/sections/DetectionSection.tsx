"use client";

import React, { useState } from "react";
import Reveal from "@/components/common/Reveal";
import ClassificationCanvas from "@/components/field/ClassificationCanvas";

/* ===========================================================================
   SECTION 03 — DETECT WHAT MATTERS
   Deliberate shape: short words → enormous moving picture → short words.
   The cascade is demonstrated by the canvas, so the copy never describes it.
   =========================================================================== */

const CLASSES = [
  {
    id: "ddos",
    name: "DDoS",
    gloss: "Volumetric flood",
    signature:
      "An enormous forward packet rate from many sources at once, almost no return traffic, flows that end without a teardown. The network is being drowned, not probed.",
    tells: ["fwd_pkt_rate", "syn_ack_ratio", "src_cardinality"],
    confusable: "DoS",
    confusableWhy:
      "The same shape produced by one machine instead of thousands. Source cardinality is the only honest separator.",
  },
  {
    id: "dos",
    name: "DoS",
    gloss: "Single-origin exhaustion",
    signature:
      "One host holding connections open or hammering a single service until it stops answering. Exhaustion without the crowd.",
    tells: ["active_time", "idle_time", "fwd_pkt_rate"],
    confusable: "DDoS",
    confusableWhy:
      "Distinguished only by how many sources share the behaviour, which is why we never collapse the two into one label.",
  },
  {
    id: "portscan",
    name: "Port Scan",
    gloss: "Reconnaissance sweep",
    signature:
      "One source touching a wide spread of destination ports with tiny payloads and many connections never completed. Someone is drawing a map.",
    tells: ["dst_port_variance", "init_win_bytes", "failed_conn_ratio"],
    confusable: "Normal",
    confusableWhy:
      "Vulnerability scanners and monitoring agents scan legitimately every day. Context decides, not the pattern alone.",
  },
  {
    id: "bruteforce",
    name: "Brute Force",
    gloss: "Credential stuffing",
    signature:
      "Repeated authentication attempts against one service on a suspiciously regular cadence, with near-identical payload sizes. Patience rendered as traffic.",
    tells: ["auth_failure_rate", "burst_regularity", "flow_iat_std"],
    confusable: "Normal",
    confusableWhy:
      "A misconfigured client retrying a stale password looks almost exactly like an attacker being careful.",
  },
  {
    id: "botnet",
    name: "Botnet",
    gloss: "C2 beaconing",
    signature:
      "Many internal hosts independently contacting the same external endpoint on a periodic interval with small, consistent payloads. The coordination is the signal, not the volume.",
    tells: ["beacon_periodicity", "host_synchrony", "payload_entropy"],
    confusable: "Normal",
    confusableWhy:
      "Update checks, telemetry agents and licence servers all beacon on a schedule too.",
  },
  {
    id: "webattack",
    name: "Web Attack",
    gloss: "Injection and traversal",
    signature:
      "HTTP flows with anomalous payload entropy and length distribution, concentrated against a few endpoints rather than spread across a site.",
    tells: ["payload_entropy", "pkt_len_var", "dst_concentration"],
    confusable: "Normal",
    confusableWhy:
      "A large legitimate upload shares much of the length profile. This is the hardest of the six.",
  },
];

const MODELS = [
  { name: "Decision Tree", note: "baseline", strong: false },
  { name: "Random Forest", note: "bagging", strong: false },
  { name: "Extra Trees", note: "bagging", strong: false },
  { name: "SVM", note: "kernel / margin", strong: false },
  { name: "XGBoost", note: "boosting", strong: false },
  { name: "Weighted Soft Voting", note: "ensemble", strong: true },
  { name: "Stacking Ensemble", note: "meta-learner", strong: true },
];

const COLUMNS = ["Accuracy", "Macro-F1", "Precision", "Recall", "FPR", "FNR"];

export default function DetectionSection() {
  const [flipped, setFlipped] = useState<string | null>(null);

  return (
    <section id="detection" className="relative bg-[#FFFFEB]">
      {/* ================= ACT 1 — SHORT WORDS ================= */}
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-28 sm:pt-40 pb-16 sm:pb-24">
        <Reveal>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8E86]">
            Detection &amp; Classification // 03
          </div>
        </Reveal>

        <Reveal delay={90}>
          <h2
            className="font-serif tracking-tight leading-[0.94] mt-7 text-[#171917]"
            style={{ fontSize: "clamp(46px, 8vw, 104px)" }}
          >
            Anomaly is not
            <br />
            <em className="font-normal italic">an answer.</em>
          </h2>
        </Reveal>

        <Reveal delay={180}>
          <p className="type-body mt-9 max-w-[44ch]">
            Most detectors raise a hand and say something looked unusual. Kairo
            answers the harder question underneath it — which attack, on what
            evidence.
          </p>
        </Reveal>
      </div>

      {/* ================= ACT 2 — THE PICTURE ================= */}
      {/* Full-bleed: sits outside the container on purpose. */}
      <Reveal>
        <ClassificationCanvas />
      </Reveal>

      <div className="mx-auto max-w-[1180px] px-6 sm:px-10">
        <Reveal delay={80}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-12 py-12 sm:py-16 border-b border-[#DCDDCB]">
            <p className="md:col-span-5 font-serif italic text-[22px] sm:text-[27px] leading-snug tracking-tight text-[#171917]">
              Two gates, not one verdict.
            </p>
            <p className="md:col-span-7 type-body-sm leading-relaxed max-w-[62ch]">
              Every flow is first asked only whether it is malicious. Most never
              travel past that line. Only what survives is given a name — and
              splitting the problem this way is what stops a rare botnet from
              being averaged away by an ocean of ordinary traffic.
            </p>
          </div>
        </Reveal>
      </div>

      {/* ================= ACT 3 — THE SIX ================= */}
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
        <Reveal>
          <h3
            className="font-serif tracking-tight leading-[0.98] text-[#171917] max-w-[13ch]"
            style={{ fontSize: "clamp(34px, 5vw, 62px)" }}
          >
            The six we can name.
          </h3>
          <p className="type-body-sm mt-5 max-w-[46ch]">
            Tap any card to see what it hides behind. A detector that cannot say
            what it might be wrong about is not being honest with you.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mt-14">
          {CLASSES.map((c, i) => {
            const on = flipped === c.id;
            return (
              <Reveal key={c.id} delay={i * 70}>
                <button
                  type="button"
                  onClick={() => setFlipped(on ? null : c.id)}
                  aria-pressed={on}
                  className="group relative w-full text-left rounded-2xl overflow-hidden cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1"
                  style={{
                    backgroundColor: on ? "#141816" : "#F7F7E7",
                    border: `1px solid ${on ? "#141816" : "#DCDDCB"}`,
                    boxShadow: on
                      ? "0 24px 60px -18px rgba(23,25,23,0.45)"
                      : "0 1px 2px rgba(23,25,23,0.03)",
                  }}
                >
                  <div
                    className="p-7 flex flex-col"
                    style={{ minHeight: 340 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className="font-mono text-[10px] tabular-nums transition-colors duration-500"
                        style={{
                          color: on ? "rgba(255,255,255,0.35)" : "#B0B4AC",
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className="font-mono text-[16px] leading-none transition-all duration-500"
                        style={{
                          color: on ? "#FB7185" : "#B0B4AC",
                          transform: on ? "rotate(45deg)" : "none",
                        }}
                      >
                        +
                      </span>
                    </div>

                    <div
                      className="font-serif tracking-tight leading-none mt-6 transition-colors duration-500"
                      style={{
                        fontSize: "clamp(30px, 3.4vw, 42px)",
                        color: on ? "#FFFFEB" : "#171917",
                      }}
                    >
                      {c.name}
                    </div>
                    <div
                      className="font-mono text-[9.5px] uppercase tracking-[0.16em] mt-2.5 transition-colors duration-500"
                      style={{
                        color: on ? "rgba(255,255,255,0.4)" : "#8A8E86",
                      }}
                    >
                      {c.gloss}
                    </div>

                    {/* front and back share the slot so the card never resizes */}
                    <div className="relative flex-1 mt-6 min-h-[132px]">
                      <div
                        className="absolute inset-0 transition-opacity duration-300"
                        style={{ opacity: on ? 0 : 1 }}
                      >
                        <p className="type-body-sm leading-relaxed">
                          {c.signature}
                        </p>
                      </div>
                      <div
                        className="absolute inset-0 transition-opacity duration-300"
                        style={{ opacity: on ? 1 : 0 }}
                      >
                        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#FBBF24]">
                          Confusable with {c.confusable}
                        </div>
                        <p className="text-[13.5px] leading-relaxed text-white/65 mt-3">
                          {c.confusableWhy}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-5">
                      {c.tells.map((t) => (
                        <span
                          key={t}
                          className="font-mono text-[9px] uppercase tracking-[0.08em] px-2 py-1 rounded transition-colors duration-500"
                          style={{
                            backgroundColor: on
                              ? "rgba(255,255,255,0.07)"
                              : "#EDEDDB",
                            color: on ? "rgba(255,255,255,0.5)" : "#62665F",
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>

      {/* ================= ACT 4 — THE EMPTY TABLE ================= */}
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pb-28 sm:pb-40">
        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-end pb-10 border-b border-[#171917]">
            <div className="lg:col-span-7">
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#8A8E86]">
                Evaluation beyond accuracy
              </div>
              <h3
                className="font-serif tracking-tight leading-[0.98] mt-5 text-[#171917]"
                style={{ fontSize: "clamp(32px, 4.6vw, 58px)" }}
              >
                Accuracy is the easiest number to hide behind.
              </h3>
            </div>
            <p className="lg:col-span-5 type-body-sm leading-relaxed">
              A model that calls everything normal still scores well on a dataset
              where almost everything is. So we report precision, recall,
              macro-F1, false-positive and false-negative rates per class — and
              never accuracy on its own.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="overflow-x-auto mt-10">
            <table className="w-full border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[#DCDDCB]">
                  <th className="text-left font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#171917] pb-3 pr-4">
                    Model
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c}
                      className="text-right font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#8A8E86] pb-3 pl-4"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODELS.map((m) => (
                  <tr key={m.name} className="border-b border-[#DCDDCB]">
                    <td className="py-4 pr-4">
                      <span
                        className={`font-sans text-[14px] tracking-tight ${
                          m.strong
                            ? "text-[#171917] font-semibold"
                            : "text-[#62665F]"
                        }`}
                      >
                        {m.name}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#B0B4AC] ml-2.5">
                        {m.note}
                      </span>
                    </td>
                    {COLUMNS.map((c) => (
                      <td
                        key={c}
                        className="py-4 pl-4 text-right font-mono text-[15px] text-[#C8C8B4] select-none"
                      >
                        —
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal delay={140}>
          <div className="mt-10 border-l-2 border-[#E11D48] pl-6 max-w-[58ch]">
            <p className="font-serif italic text-[20px] sm:text-[26px] text-[#171917] leading-snug">
              Every cell is empty on purpose.
            </p>
            <p className="type-body-sm mt-3.5 leading-relaxed">
              They get filled from our own experiments on CICIDS2017 and our own
              generalization run against UNSW-NB15 — not copied from the
              literature we built on. Until then, a number here would be the most
              convincing thing on this page and the least true.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
