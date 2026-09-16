import React from "react";

interface KairoMarkProps {
  size?: number;
  className?: string;
  /** the ink: shield outline, stem and leg */
  strokeColor?: string;
  /** bright end of the blade gradient, and the decision node */
  accentColor?: string;
  /** deep end of the blade gradient, at the node */
  accentDeep?: string;
}

/* Geometry generated from the brand artwork rather than drawn by eye —
   brand/kairo_gen.py measures the reference and emits these paths, so the
   proportions, the 46.9-degree arms and the ring around the node are the
   artwork's own. Regenerate there, paste here — see brand/README.md. */
const SHIELD =
  "M16 1.37L4.4 5.58L4.4 17.51C4.47 22.28 9.86 28.85 16 30.64C22.14 28.85 27.53 22.28 27.6 17.51L27.6 5.58Z";
const STEM =
  "M9.85 7.95L12.51 7.95A0.44 0.44 0 0 1 12.95 8.39L12.95 13.64A2.03 2.03 0 0 0 12.95 17.69L12.95 22.52A0.44 0.44 0 0 1 12.51 22.96L9.85 22.96A0.44 0.44 0 0 1 9.41 22.52L9.41 8.39A0.44 0.44 0 0 1 9.85 7.95Z";
const BLADE =
  "M13.56 13.68L18.92 7.95L23.11 7.95L16.5 15.02L15.03 15.02A2.03 2.03 0 0 0 13.56 13.68Z";
const LEG =
  "M13.76 17.59L18.79 22.96L22.89 22.96L16.67 16.31L15.03 16.31A2.03 2.03 0 0 1 13.76 17.59Z";
const NODE = { cx: 13.1, cy: 15.66, r: 1.48 };

/**
 * Kairo Signature Mark
 * A K inside the guard: the stem, the stream arriving as the green blade, the
 * answer leaving as the leg, and the decision node held in the gap where the
 * three would meet.
 */
export default function KairoMark({
  size = 28,
  className = "",
  strokeColor = "currentColor",
  accentColor = "#16DFA0",
  accentDeep = "#0A7A5D",
}: KairoMarkProps) {
  // keyed on the colours, so two marks in the same colourway share one def and
  // two different colourways never collide — no useId, still server-safe
  const gid = `kb-${accentDeep}${accentColor}`.replace(/#/g, "");
  // the artwork's own weight is 0.7; small sizes need the guard thicker than
  // a hairline or it greys out against the K
  const sw = size >= 48 ? 0.7 : 0.95;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kairo"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="13.1"
          y1="15.66"
          x2="23.11"
          y2="7.95"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={accentDeep} />
          <stop offset="1" stopColor={accentColor} />
        </linearGradient>
      </defs>
      <path
        d={SHIELD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={sw}
        strokeLinejoin="miter"
        strokeMiterlimit={8}
      />
      <path d={STEM} fill={strokeColor} />
      <path d={LEG} fill={strokeColor} />
      <path d={BLADE} fill={`url(#${gid})`} />
      <circle {...NODE} fill={accentColor} />
    </svg>
  );
}
