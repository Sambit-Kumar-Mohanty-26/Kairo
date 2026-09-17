"use client";

import React, { useState } from "react";
import Reveal from "@/components/common/Reveal";
import ClassificationCanvas from "@/components/field/ClassificationCanvas";

/* ===========================================================================
   SECTION 03 — DETECT WHAT MATTERS
   Deliberate shape: short words → enormous moving picture → short words.
   The cascade is demonstrated by the canvas, so the copy never describes it.
   =========================================================================== */

/* `tells` are measured, not chosen. Each is the three features that carry
   more one-vs-rest mutual information about that class than they do about the
   rest — the spelling is the dataset's own, and the source of truth is
   ml/artifacts/tells.json (`python -m kairo_ml.selection`). An earlier draft
   listed invented names like `beacon_periodicity`, which sound like features
   and are not in CICIDS2017 or in the model. */
const CLASSES = [
  {
    id: "ddos",
    name: "DDoS",
    gloss: "Volumetric flood",
    signature:
      "An enormous forward packet rate from many sources at once, almost no return traffic, flows that end without a teardown. The network is being drowned, not probed.",
    tells: ["Fwd Packet Length Mean", "Init_Win_bytes_forward", "Fwd IAT Std"],
    confusable: "DoS",
    confusableWhy:
      "The same shape produced by one machine instead of thousands. Source addresses are dropped before training as leakage, so nothing here counts sources — the split is earned on packet size and window shape alone.",
  },
  {
    id: "dos",
    name: "DoS",
    gloss: "Single-origin exhaustion",
    signature:
      "One host holding connections open or hammering a single service until it stops answering. Exhaustion without the crowd.",
    tells: ["Idle Min", "Active Max", "Active Mean"],
    confusable: "DDoS",
    confusableWhy:
      "Not separable by source count, which the model never sees. What separates them is time: a DoS holds connections idle and open, and a flood has no idle time to hold.",
  },
  {
    id: "portscan",
    name: "Port Scan",
    gloss: "Reconnaissance sweep",
    signature:
      "Tiny forward segments arriving back to back against a wide spread of destination ports, with almost nothing coming back. Someone is drawing a map.",
    tells: ["min_seg_size_forward", "Bwd Packet Length Min", "Fwd IAT Min"],
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
    tells: ["Bwd IAT Std", "Destination Port", "Bwd IAT Total"],
    confusable: "Normal",
    confusableWhy:
      "A misconfigured client retrying a stale password looks almost exactly like an attacker being careful.",
  },
  {
    id: "botnet",
    name: "Botnet",
    gloss: "C2 beaconing",
    signature:
      "A small, regular conversation with an external endpoint on an unusual port, repeated on a schedule. The volume is never the signal — the interval is.",
    tells: ["Bwd IAT Min", "Destination Port", "min_seg_size_forward"],
    confusable: "Normal",
    confusableWhy:
      "Update checks, telemetry agents and licence servers all beacon on a schedule too. Measured, this is the hardest of the six: F1 0.9746, and almost every point it loses is a benign flow called a bot.",
  },
  {
    id: "webattack",
    name: "Web Attack",
    gloss: "Injection and traversal",
    signature:
      "HTTP flows with anomalous payload entropy and length distribution, concentrated against a few endpoints rather than spread across a site.",
    tells: ["Fwd IAT Min", "Flow IAT Min", "Fwd IAT Std"],
    confusable: "Normal",
    confusableWhy:
      "A large legitimate upload shares much of the length profile, so what is left to separate them is timing. Second hardest of the six at F1 0.9907.",
  },
];

/* Measured, not cited. Every row is our own run on CICIDS2017 — the same
   253,240-flow sample, the same 30 selected features, the same held-out
   50,648 flows — so the rows are comparable to each other. Regenerate with
   `python -m kairo_ml.benchmark` and `python -m kairo_ml.cascade`; the
   source of truth is ml/artifacts/benchmark.json. The bolded row is what
   ships, and it is deliberately not the highest macro-F1 here — see below. */
const MODELS = [
  { name: "Decision Tree", note: "baseline", strong: false, v: [0.998, 0.9907, 0.9914, 0.99, 0.0003, 0.01] },
  { name: "Random Forest", note: "bagging", strong: false, v: [0.9985, 0.9932, 0.9932, 0.9932, 0.0003, 0.0068] },
  { name: "Extra Trees", note: "bagging", strong: false, v: [0.9982, 0.9919, 0.9922, 0.9916, 0.0003, 0.0084] },
  { name: "SVM", note: "60k subsample", strong: false, v: [0.9718, 0.91, 0.8763, 0.975, 0.0047, 0.025] },
  { name: "XGBoost", note: "boosting", strong: false, v: [0.9989, 0.9939, 0.9931, 0.9948, 0.0002, 0.0052] },
  { name: "Weighted Soft Voting", note: "ensemble", strong: false, v: [0.9988, 0.9943, 0.9928, 0.9958, 0.0002, 0.0042] },
  { name: "Stacking Ensemble", note: "best macro-F1", strong: false, v: [0.9989, 0.9948, 0.9919, 0.9979, 0.0002, 0.0021] },
  { name: "Two-Stage Cascade", note: "deployed", strong: true, v: [0.9989, 0.9945, 0.9922, 0.9969, 0.0002, 0.0031] },
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
              Every flow is first asked only whether it is malicious, and only
              what survives that gate is given a name — the naming ensemble
              never runs on a flow the gate turned away. Four in five flows in
              the capture are benign and stop at the first question; our test
              split is deliberately balanced, so three quarters of it carries
              on to the second.
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
                    {m.v.map((n, i) => (
                      <td
                        key={COLUMNS[i]}
                        className={`py-4 pl-4 text-right font-mono text-[15px] tabular-nums ${
                          m.strong ? "text-[#171917]" : "text-[#62665F]"
                        }`}
                      >
                        {n.toFixed(4)}
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
              These are our numbers, on our split.
            </p>
            <p className="type-body-sm mt-3.5 leading-relaxed">
              Eight models trained on the same 253,240 flows drawn from
              CICIDS2017, scored on the same 50,648 held out from it, across
              seven classes. Nothing here is copied from the literature we
              built on, which is also why the SVM row is in it: it is the one
              approach that clearly loses, and a table that only contains
              winners is advertising.
            </p>
            <p className="type-body-sm mt-3 leading-relaxed">
              The deployed row is not the best row. Flat stacking scores 0.0003
              more macro-F1 than the cascade, and resampling the split a
              thousand times puts that gap at{" "}
              <span className="font-mono tabular-nums">
                &minus;0.0003 [&minus;0.0013, +0.0006]
              </span>{" "}
              &mdash; straddling zero, because macro-F1 here averages in a
              class with 389 test rows. Two models inside each other&rsquo;s
              noise get chosen on architecture, and we take the one that can
              refuse a flow before paying to name it.
            </p>

            <p className="type-body-sm mt-3 leading-relaxed">
              Read the last two columns first. One dataset, one week, one
              network — a score here means the model learned this capture.
              Whether it learned <span className="italic">attacks</span> is a
              different question, and section 07 answers it less kindly.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
