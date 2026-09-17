"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Reveal from "@/components/common/Reveal";

/* ===========================================================================
   SECTION 07 — THE INTELLIGENCE BEHIND KAIRO
   Three movements, each one a picture of a method rather than a paragraph
   about it: features being culled, candidates being combined, a model being
   moved to a dataset it has never seen. Every number in here is from our own
   run — including the one in movement 3 that says the model did not survive
   the trip. Sources of truth: ml/artifacts/selection.json, benchmark.json,
   generalization.json.
   =========================================================================== */

/* ---- movement 1: feature selection ---------------------------------------
   CICIDS2017 ships 78 flow features. Nine go before selection even starts:
   six identify the flow rather than describe it (IPs, ports, timestamps) and
   three are dead on arrival. The remaining 69 are the real candidates, and
   what follows is the real cull — regenerate with `python -m
   kairo_ml.benchmark`, source of truth ml/artifacts/selection.json.

   Stage 0 survives; 1 dies to the variance floor, 2 to correlation pruning,
   3 to mutual information. Order is scrambled deterministically because the
   dataset's column order carries no meaning and a sorted cull reads as a bar
   chart instead of a thinning field. */
const FEATURES: [string, number][] = [
  ["Fwd URG Flags", 1],
  ["Max Packet Length", 2],
  ["Bwd Packet Length Min", 0],
  ["Packet Length Std", 2],
  ["Destination Port", 0],
  ["Total Backward Packets", 1],
  ["Idle Std", 3],
  ["Fwd Packet Length Min", 0],
  ["Avg Fwd Segment Size", 2],
  ["Fwd IAT Std", 0],
  ["Total Length of Bwd Packets", 1],
  ["Bwd Packet Length Max", 0],
  ["Flow Bytes/s", 1],
  ["FIN Flag Count", 3],
  ["Bwd IAT Min", 0],
  ["Bwd Packet Length Mean", 2],
  ["Fwd Packets/s", 0],
  ["act_data_pkt_fwd", 1],
  ["Packet Length Mean", 0],
  ["Active Max", 0],
  ["SYN Flag Count", 2],
  ["min_seg_size_forward", 0],
  ["Bwd IAT Max", 2],
  ["Flow Duration", 0],
  ["Subflow Fwd Bytes", 1],
  ["Fwd PSH Flags", 3],
  ["Flow IAT Min", 0],
  ["Avg Bwd Segment Size", 2],
  ["Flow IAT Std", 0],
  ["Total Fwd Packets", 1],
  ["Fwd Packet Length Max", 0],
  ["Subflow Fwd Packets", 1],
  ["URG Flag Count", 3],
  ["Fwd IAT Min", 0],
  ["Fwd IAT Total", 2],
  ["Fwd IAT Mean", 0],
  ["RST Flag Count", 1],
  ["Active Std", 3],
  ["Active Mean", 0],
  ["Bwd Packet Length Std", 2],
  ["Bwd IAT Mean", 0],
  ["Fwd IAT Max", 2],
  ["Fwd Packet Length Mean", 0],
  ["Subflow Bwd Bytes", 1],
  ["PSH Flag Count", 3],
  ["Min Packet Length", 0],
  ["Average Packet Size", 2],
  ["Flow IAT Mean", 0],
  ["CWE Flag Count", 1],
  ["Init_Win_bytes_backward", 0],
  ["Subflow Bwd Packets", 1],
  ["Flow IAT Max", 2],
  ["Bwd IAT Std", 0],
  ["Idle Max", 2],
  ["Bwd Packets/s", 0],
  ["Bwd Header Length", 1],
  ["ACK Flag Count", 3],
  ["Active Min", 0],
  ["Fwd Packet Length Std", 2],
  ["Bwd IAT Total", 0],
  ["ECE Flag Count", 1],
  ["Init_Win_bytes_forward", 0],
  ["Total Length of Fwd Packets", 1],
  ["Down/Up Ratio", 3],
  ["Idle Min", 0],
  ["Idle Mean", 2],
  ["Flow Packets/s", 0],
  ["Fwd Header Length", 1],
  ["Packet Length Variance", 0],
];

const SHIPPED = 78;
const KEPT_COUNT = FEATURES.filter(([, g]) => g === 0).length;
const barHeight = (i: number) => 22 + ((i * 53) % 46);

const CRITERIA = [
  ["Variance floor", "a feature that barely moves cannot separate anything"],
  ["Correlation pruning", "two features saying the same thing earn one seat"],
  ["Mutual information", "how much a feature tells us about the label"],
];
/* Three stages, not four. An earlier draft listed model-based importance as a
   fourth criterion; the pipeline does not use it to select, only to explain a
   single verdict after the fact, so it does not belong in this list. */

/* ---- movement 2: ensemble learning --------------------------------------- */
const CANDIDATE_MODELS = [
  { name: "Decision Tree", note: "interpretable, brittle alone" },
  { name: "Random Forest", note: "bagging, variance down" },
  { name: "Extra Trees", note: "more randomness, faster" },
  { name: "SVM", note: "margins in scaled space" },
  { name: "XGBoost", note: "boosting, hardest classes" },
];

/* ---- movement 3: generalization ------------------------------------------ */
const PLATES = [
  {
    tag: "Trained on",
    name: "CICIDS2017",
    lines: ["253,240 labelled flows", "six attack families", "30 features of 78 shipped"],
    accent: "#6EE7B7",
  },
  {
    tag: "Tested on",
    name: "UNSW-NB15",
    lines: [
      "447,915 flows, re-extracted",
      "ten families, three we share",
      "different network, 2015",
    ],
    accent: "#FBBF24",
  },
];

/** True once the node has been scrolled into view, and stays true. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "-15% 0px -15% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

export default function ResearchSection() {
  const [gridRef, culled] = useSeen<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <>
    <section id="research" className="relative bg-[#FFFFEB]">
      {/* ================= ACT 1 — SHORT WORDS ================= */}
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-28 sm:pt-40 pb-16 sm:pb-24">
        <Reveal>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8E86]">
            Research foundation // 07
          </div>
        </Reveal>
        <Reveal delay={90}>
          <h2
            className="font-serif tracking-tight leading-[0.94] mt-7 text-[#171917]"
            style={{ fontSize: "clamp(46px, 8vw, 104px)" }}
          >
            The argument
            <br />
            <em className="font-normal italic">under the answer.</em>
          </h2>
        </Reveal>
        <Reveal delay={180}>
          <p className="type-body mt-9 max-w-[47ch]">
            Kairo is a research project before it is a product. Three decisions
            carry it: which features to trust, how to combine models that each
            fail differently, and whether any of it survives a network it has
            never seen.
          </p>
        </Reveal>
      </div>

      {/* ================= MOVEMENT 1 — THE CULL ================= */}
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pb-24 sm:pb-32">
        <Reveal>
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 pb-8 border-b border-[#171917]">
            <h3
              className="font-serif tracking-tight leading-[0.98] text-[#171917]"
              style={{ fontSize: "clamp(30px, 4.2vw, 54px)" }}
            >
              Most of a flow is noise.
            </h3>
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#8A8E86]">
              Feature selection · 01
            </span>
          </div>
        </Reveal>

        {/* the cull: 78 candidates, a minority left standing */}
        <div ref={gridRef} className="mt-14">
          <div className="flex items-end gap-[3px] sm:gap-[5px] h-[72px]">
            {FEATURES.map(([name, stage], i) => {
              const survives = stage === 0;
              const on = !culled || survives;
              return (
                <div
                  key={name}
                  title={survives ? name : `${name} — cut at stage ${stage}`}
                  className="flex-1 rounded-t-[1px]"
                  style={{
                    height: culled && !survives ? 5 : barHeight(i),
                    backgroundColor: on
                      ? culled
                        ? "#171917"
                        : "#B0B4AC"
                      : "#DCDDCB",
                    transition:
                      "height 900ms var(--ease-cinematic), background-color 900ms var(--ease-cinematic)",
                    transitionDelay: `${i * 11}ms`,
                  }}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mt-6 pt-5 border-t border-[#DCDDCB]">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8A8E86]">
              {SHIPPED} shipped · {FEATURES.length} candidates
            </span>
            <span className="text-[#B0B4AC]">→</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#171917] font-bold">
              {KEPT_COUNT} carried forward
            </span>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-[#B0B4AC]">
              measured · 69 → 53 → 38 → 30 · hover a bar for the feature
            </span>
          </div>
        </div>

        <Reveal delay={80}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10 mt-16">
            {CRITERIA.map(([h, b], i) => (
              <div key={h}>
                <div className="font-mono text-[10px] tabular-nums text-[#B0B4AC]">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="font-sans text-[15px] font-semibold tracking-tight text-[#171917] mt-3">
                  {h}
                </div>
                <p className="type-body-sm leading-relaxed mt-2">{b}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <p className="type-body-sm leading-relaxed mt-14 max-w-[58ch] border-l-2 border-[#171917] pl-6">
            Cutting features is not an optimisation. A model with 78 inputs can
            memorise the capture it was trained on — the subset is what forces
            it to learn the behaviour instead.
          </p>
        </Reveal>
      </div>

      {/* ================= MOVEMENT 2 — THE ENSEMBLE ================= */}
      <Reveal>
        <div className="w-full bg-[#0B0E0D] text-[#FFFFEB]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 sm:px-10 py-4 border-b border-white/8">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
              Ensemble
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
              Feature selection · 02
            </span>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-white/30 border border-white/12 rounded-full px-2.5 py-1">
              cascade deployed · macro-F1 0.9945 · section 03 has the table
            </span>
          </div>

          <div className="mx-auto max-w-[1440px] px-6 sm:px-10 py-14 sm:py-20">
            <h3
              className="font-serif tracking-tight leading-[0.98] max-w-[20ch]"
              style={{ fontSize: "clamp(30px, 4.2vw, 54px)" }}
            >
              Every model looks identical until the rare classes.
            </h3>
            <p className="text-[14.5px] leading-relaxed text-white/45 mt-6 max-w-[52ch]">
              Five of the seven are solved by anything with a tree in it —
              nothing scores below 0.9986 on DDoS. The ensemble earns its keep
              on the two rarest. Botnet is 389 flows in our test set: a lone
              decision tree gets F1 0.9589 there, stacking gets 0.9773. The
              SVM shows the other direction, collapsing to 0.6282 on that same
              class, which is why we do not pick a winner by reputation.
            </p>

            {/* five candidates, one verdict */}
            <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-5">
                {CANDIDATE_MODELS.map((m) => {
                  const on = hovered === m.name;
                  return (
                    <div
                      key={m.name}
                      onMouseEnter={() => setHovered(m.name)}
                      onMouseLeave={() => setHovered(null)}
                      className="flex items-baseline gap-4 py-3.5 border-b border-white/8 transition-colors duration-300"
                      style={{ backgroundColor: on ? "rgba(255,255,255,0.03)" : "transparent" }}
                    >
                      <span
                        className="h-px shrink-0 transition-all duration-500"
                        style={{
                          width: on ? 26 : 12,
                          backgroundColor: on ? "#E4D4F8" : "rgba(255,255,255,0.25)",
                        }}
                      />
                      <div className="min-w-0">
                        <div
                          className="font-sans text-[15px] tracking-tight transition-colors duration-300"
                          style={{ color: on ? "#FFFFEB" : "rgba(255,255,255,0.72)" }}
                        >
                          {m.name}
                        </div>
                        <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/25 mt-1">
                          {m.note}
                        </div>
                      </div>
                      <span className="ml-auto font-mono text-[11px] tabular-nums text-white/20">
                        w = —
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* the combination */}
              <div className="lg:col-span-7">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                  Weighted soft voting
                </div>
                {/* Five opinions arriving at one. The pulse is the mechanism;
                    the weights beneath it are the hand-set 0.40/0.35/0.25 from
                    WEIGHTS in ml/src/kairo_ml/train.py, which is exactly why
                    the stacking alternative that learns them is the one that
                    ended up inside the deployed cascade. */}
                <svg
                  viewBox="0 0 600 200"
                  className="w-full h-auto mt-4"
                  aria-hidden
                >
                  {CANDIDATE_MODELS.map((m, i) => {
                    const y = 24 + i * 38;
                    const on = hovered === m.name;
                    const d = `M 6 ${y} C 200 ${y} 260 100 430 100`;
                    return (
                      <g
                        key={m.name}
                        style={{
                          opacity: !hovered || on ? 1 : 0.22,
                          transition: "opacity 400ms var(--ease-cinematic)",
                        }}
                      >
                        <path
                          d={d}
                          fill="none"
                          stroke="rgba(255,255,255,0.14)"
                          strokeWidth={1}
                        />
                        <path
                          className="fabric-pulse"
                          d={d}
                          fill="none"
                          stroke={on ? "#E4D4F8" : "rgba(228,212,248,0.5)"}
                          strokeWidth={on ? 2.2 : 1.4}
                          strokeLinecap="round"
                          pathLength={100}
                          strokeDasharray="3 97"
                          style={{ animationDelay: `${i * 0.5}s` }}
                        />
                        <circle
                          cx={6}
                          cy={y}
                          r={3.5}
                          fill={on ? "#E4D4F8" : "rgba(255,255,255,0.35)"}
                        />
                      </g>
                    );
                  })}

                  {/* where they are combined, and the single answer out */}
                  <circle
                    cx={430}
                    cy={100}
                    r={28}
                    fill="none"
                    stroke="rgba(255,255,255,0.18)"
                    strokeDasharray="2 7"
                  />
                  <circle cx={430} cy={100} r={13} fill="#E4D4F8" />
                  <path
                    d="M 458 100 H 594"
                    stroke="rgba(255,255,255,0.28)"
                    strokeWidth={1}
                    fill="none"
                  />
                </svg>
                <p className="font-mono text-[9.5px] text-white/25 mt-3">
                  each candidate returns a probability per class · these weights
                  are ours by hand — 0.40 / 0.35 / 0.25 — and that is the point
                  of the alternative below
                </p>

                <div className="mt-10 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                  Stacking alternative
                </div>
                <div className="mt-4 p-5 rounded-xl border border-white/10 bg-white/[0.03]">
                  <div className="font-sans text-[15px] text-white/80">
                    A meta-learner reads the tree models&rsquo; outputs as its
                    input
                  </div>
                  <p className="text-[13.5px] leading-relaxed text-white/40 mt-2.5">
                    Three of them — random forest, extra trees, XGBoost — with
                    a logistic regression over the top, fitted on three-fold
                    out-of-fold predictions so it cannot simply memorise its
                    own members. It beat the hand-weighted vote by 0.0005
                    macro-F1, all of it on the two rare classes. A thin margin,
                    honestly earned — and this is the stage that names a flow
                    once the gate has decided it is worth naming.
                  </p>
                </div>

                <div className="flex items-center gap-4 mt-10 pt-6 border-t border-white/8">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
                    Output
                  </span>
                  <span className="font-mono text-[13px] text-white/70">
                    one class · one probability · one evidence set
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ================= MOVEMENT 3 — GENERALIZATION ================= */}
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-24 sm:py-32">
        <Reveal>
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 pb-8 border-b border-[#171917]">
            <h3
              className="font-serif tracking-tight leading-[0.98] text-[#171917] max-w-[22ch]"
              style={{ fontSize: "clamp(30px, 4.2vw, 54px)" }}
            >
              A model that only works on its own dataset works nowhere.
            </h3>
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#8A8E86]">
              Generalization · 03
            </span>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 md:gap-4 items-stretch mt-14">
            {PLATES.map((p, i) => (
              <React.Fragment key={p.name}>
                <div className="rounded-2xl border border-[#DCDDCB] bg-[#F7F7E7] p-7 sm:p-9">
                  <div
                    className="font-mono text-[9px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: "#8A8E86" }}
                  >
                    {p.tag}
                  </div>
                  <div
                    className="font-mono tracking-tight text-[#171917] leading-none mt-4"
                    style={{ fontSize: "clamp(26px, 3.4vw, 40px)" }}
                  >
                    {p.name}
                  </div>
                  <div className="h-[3px] w-14 rounded-full mt-6" style={{ backgroundColor: p.accent }} />
                  <ul className="mt-6 space-y-2.5">
                    {p.lines.map((l) => (
                      <li key={l} className="type-body-sm leading-relaxed flex gap-3">
                        <span className="text-[#B0B4AC] font-mono text-[10px] mt-[3px]">
                          ·
                        </span>
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
                {i === 0 && (
                  <div className="flex md:flex-col items-center justify-center gap-3 py-2 md:py-0 md:px-4">
                    <div className="h-px md:h-full w-full md:w-px border-t md:border-t-0 md:border-l border-dashed border-[#B0B4AC] flex-1" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8A8E86] whitespace-nowrap md:[writing-mode:vertical-rl]">
                      no retraining
                    </span>
                    <div className="h-px md:h-full w-full md:w-px border-t md:border-t-0 md:border-l border-dashed border-[#B0B4AC] flex-1" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-end">
            <div className="lg:col-span-7">
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#8A8E86]">
                What we are looking for
              </div>
              <p className="font-serif italic text-[20px] sm:text-[26px] text-[#171917] leading-snug mt-4">
                How much we lose when the network changes. The answer was
                everything, which is why the honest version of this section is
                the one worth reading.
              </p>
              <p className="type-body-sm leading-relaxed mt-5 max-w-[56ch]">
                Trained on one week of one university network in 2017, tested
                on a different network captured in 2015 by different people,
                with no retraining and no tuning. 29 of the 30 features line up
                between the two extractions; destination port does not exist in
                the second, so the model was refit on the 29 both share and
                measured at home on those before it travelled.
              </p>
            </div>
            <div className="lg:col-span-5">
              <div className="flex items-end justify-between pb-4 border-b border-[#DCDDCB]">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8E86]">
                  Macro-F1 delta
                </span>
                <span className="font-mono text-[28px] text-[#E11D48] leading-none tabular-nums">
                  −0.6688
                </span>
              </div>
              <p className="type-body-sm leading-relaxed mt-4">
                0.9927 at home, <span className="text-[#171917]">0.3239</span>{" "}
                on UNSW-NB15. The model calls 447,857 of 447,915 foreign flows
                normal, including every one of the 30,951 exploits. It did not
                transfer, and we are not going to bury that: it is the most
                useful thing we measured.
              </p>
              <p className="type-body-sm leading-relaxed mt-3">
                Its accuracy on that run is 0.7999 — a respectable-looking
                number for a model that caught 13 of 89,583 attacks. That is
                the number section 03 warned you about, and we walked into it
                ourselves.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>

      {/* ================= CLOSING SLAB ================= */}
      <section className="relative bg-[#0B0E0D] text-[#FFFFEB] min-h-[82vh] flex flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-[1180px] px-6 sm:px-10 py-24">
          <Reveal>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
              Kairo
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h2
              className="font-serif tracking-tight leading-[0.92] mt-8 max-w-[15ch]"
              style={{ fontSize: "clamp(44px, 8.5vw, 118px)" }}
            >
              Know what it is.
              <br />
              <em className="font-normal italic text-white/45">
                Not just that it&rsquo;s odd.
              </em>
            </h2>
          </Reveal>
          <Reveal delay={200}>
            <div className="flex flex-wrap items-center gap-4 mt-14">
              <Link
                href="/login"
                className="font-sans text-[14px] font-medium px-7 py-3.5 rounded-full bg-[#E4D4F8] text-[#171917] transition-transform duration-300 hover:-translate-y-0.5"
              >
                Enter Kairo →
              </Link>
              <a
                href="#detection"
                className="font-sans text-[14px] px-7 py-3.5 rounded-full border border-white/20 text-white/70 transition-colors duration-300 hover:text-white hover:border-white/40"
              >
                How detection works
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
