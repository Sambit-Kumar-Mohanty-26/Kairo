"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Settings } from "lucide-react";
import KairoWordmark from "@/components/brand/KairoWordmark";
import { useConsole } from "./DemoProvider";

/* The rail is an index, not an app menu. Numbered in the margin the way the
   landing page numbers its phases, so the console reads as one more section
   of the same document. */
const NAV = [
  { n: "01", label: "Overview", href: "/dashboard" },
  { n: "02", label: "Threats", href: "/dashboard/threats" },
  { n: "03", label: "Simulation", href: "/dashboard/simulation" },
  { n: "04", label: "Network", href: "/dashboard/network" },
  { n: "05", label: "Alerts", href: "/dashboard/alerts" },
  { n: "06", label: "Model", href: "/dashboard/model" },
  { n: "07", label: "Reports", href: "/dashboard/reports" },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { office, setOffice, offices, org, mode, live } = useConsole();

  return (
    <div className="min-h-screen bg-[#FFFFEB] text-[#171917] lg:grid lg:grid-cols-[228px_1fr]">
      {/* ---- rail ---- */}
      <aside className="hidden lg:flex print:!hidden flex-col border-r border-[#DCDDCB] sticky top-0 h-screen">
        <div className="px-7 pt-7 pb-8">
          <Link href="/">
            <KairoWordmark size={22} showSubtitle />
          </Link>
        </div>

        <nav className="flex flex-col">
          {NAV.map((item) => {
            const active = path === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group relative flex items-baseline gap-3 px-7 py-2.5"
              >
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#16DFA0] transition-all duration-200 ${
                    active ? "opacity-100 translate-x-[18px]" : "opacity-0 translate-x-[10px]"
                  }`}
                />
                <span
                  className={`font-mono text-[10px] tracking-[0.14em] tabular-nums transition-colors duration-200 ${
                    active ? "text-[#059669]" : "text-[#8A8E86]"
                  }`}
                >
                  {item.n}
                </span>
                <span
                  className={`font-serif text-[19px] leading-none transition-colors duration-200 ${
                    active ? "text-[#171917]" : "text-[#62665F] group-hover:text-[#171917]"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

        </nav>

        <div className="mt-auto border-t border-[#DCDDCB]">
          <Link
            href="/dashboard/settings"
            className={`flex items-center gap-2.5 px-7 py-4 transition-colors duration-200 ${
              path === "/dashboard/settings"
                ? "text-[#171917]"
                : "text-[#62665F] hover:text-[#171917]"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="text-[13.5px] font-medium">Settings</span>
          </Link>
          {/* The one place that says, at a glance, whether anything on screen is
              real. It was hardcoded to "Fixture data" while Live Mode existed. */}
          <div className="px-7 pb-6">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8E86]">
              {mode === "live"
                ? `${live.sensorsLive} of ${live.sensorsTotal} live`
                : "Fixture data"}
            </span>
          </div>
        </div>
      </aside>

      {/* ---- scope bar + page ---- */}
      <div className="flex flex-col min-w-0">
        <header className="print:hidden sticky top-0 z-20 flex items-center gap-4 sm:gap-6 px-6 sm:px-10 h-[62px] border-b border-[#DCDDCB] bg-[#FFFFEB]/92 backdrop-blur-sm">
          <Link href="/dashboard" className="lg:hidden">
            <KairoWordmark size={20} />
          </Link>

          <div className="flex items-baseline gap-2 min-w-0">
            {/* the org name is the first thing to go when width runs out */}
            <span className="font-serif text-[16px] truncate hidden sm:inline">{org}</span>
            <span className="text-[#DCDDCB] hidden sm:inline">›</span>
            {/* native select: keyboard, mobile sheet and a11y for free */}
            <div className="relative flex items-center">
              <select
                value={office}
                onChange={(e) => setOffice(e.target.value)}
                className="appearance-none bg-transparent font-mono text-[11px] uppercase tracking-[0.14em] text-[#62665F] hover:text-[#171917] pr-4 cursor-pointer focus:outline-none"
              >
                <option value="all">All offices</option>
                {offices.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-[#8A8E86] pointer-events-none absolute right-0" />
            </div>
          </div>

          <ModeSwitch />
        </header>

        {/* below lg the rail is gone, so the same index runs horizontally */}
        <nav className="print:hidden lg:hidden flex gap-6 px-6 h-[46px] items-center border-b border-[#DCDDCB] overflow-x-auto">
          {NAV.map((item) => {
            const active = path === item.href;
            return (
              <Link key={item.href} href={item.href} className="flex items-baseline gap-2 shrink-0">
                <span
                  className={`font-mono text-[9.5px] tracking-[0.14em] tabular-nums ${
                    active ? "text-[#059669]" : "text-[#8A8E86]"
                  }`}
                >
                  {item.n}
                </span>
                <span
                  className={`font-serif text-[17px] leading-none ${
                    active ? "text-[#171917]" : "text-[#8A8E86]"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
          <Link
            href="/dashboard/settings"
            className={`shrink-0 font-serif text-[17px] leading-none ${
              path === "/dashboard/settings" ? "text-[#171917]" : "text-[#8A8E86]"
            }`}
          >
            Settings
          </Link>
        </nav>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

/* §12's switch. Test runs the fixtures; Live polls the API for whatever the
   sensors have actually reported. Live needs a session — the fixtures are a
   demo anyone may click through, a fleet is one tenant's real topology — so
   when there is no token the control says what to do about it rather than
   going quiet. */
function ModeSwitch() {
  const { mode, setMode, canGoLive, live } = useConsole();

  // In Live Mode the dot is the fleet's own state, not a decoration: green
  // once a sensor has reported inside the two-minute window, amber while
  // nothing has, rose when the feed itself is failing.
  const dot = !live.loaded
    ? "#FBBF24"
    : live.error
      ? "#E11D48"
      : live.sensorsLive > 0
        ? "#16DFA0"
        : "#FBBF24";

  const liveTitle = !canGoLive
    ? "Sign in to connect a network"
    : !live.loaded
      ? "Connecting to the live feed"
      : live.error
        ? live.error
        : `${live.sensorsLive} of ${live.sensorsTotal} sensor${live.sensorsTotal === 1 ? "" : "s"} reporting`;

  return (
    <div className="ml-auto flex items-center rounded-full border border-[#DCDDCB] p-0.5">
      <button
        onClick={() => setMode("test")}
        aria-pressed={mode === "test"}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] transition-colors duration-200 ${
          mode === "test"
            ? "bg-[#171917] text-[#FFFFEB]"
            : "text-[#8A8E86] hover:text-[#171917]"
        }`}
      >
        {mode === "test" && <span className="w-1.5 h-1.5 rounded-full bg-[#16DFA0]" />}
        Test
      </button>
      <button
        onClick={() => canGoLive && setMode("live")}
        aria-pressed={mode === "live"}
        disabled={!canGoLive}
        title={liveTitle}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] transition-colors duration-200 ${
          mode === "live"
            ? "bg-[#171917] text-[#FFFFEB]"
            : canGoLive
              ? "text-[#8A8E86] hover:text-[#171917]"
              : "text-[#C9CBBE] cursor-not-allowed"
        }`}
      >
        {mode === "live" && (
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: dot }}
          />
        )}
        Live
      </button>
    </div>
  );
}
