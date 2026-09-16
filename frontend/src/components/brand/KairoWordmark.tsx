import React from "react";
import KairoMark from "./KairoMark";

interface KairoWordmarkProps {
  size?: number;
  showSubtitle?: boolean;
  className?: string;
  theme?: "light" | "dark";
}

export default function KairoWordmark({
  size = 24,
  showSubtitle = false,
  className = "",
  theme = "light",
}: KairoWordmarkProps) {
  const isDark = theme === "dark";

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* the green is constant across themes; only the ink flips */}
      <KairoMark size={size} strokeColor={isDark ? "#FFFFEB" : "#171917"} />
      <div
        className="flex flex-col"
        // Chromium on Windows renders small light text on a near-black
        // surface with visible RGB fringing (ClearType subpixel AA) —
        // -webkit-font-smoothing: antialiased alone doesn't stop it.
        // Promoting the whole label to its own GPU layer does.
        style={isDark ? { transform: "translateZ(0)" } : undefined}
      >
        <span
          className={`font-sans font-bold tracking-[0.14em] text-[15px] uppercase leading-none ${
            isDark ? "text-white" : "text-[#171917]"
          }`}
        >
          Kairo
        </span>
        {showSubtitle && (
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.2em] mt-1 ${
              isDark ? "text-[#8A8E86]" : "text-[#62665F]"
            }`}
          >
            Intelligence
          </span>
        )}
      </div>
    </div>
  );
}
