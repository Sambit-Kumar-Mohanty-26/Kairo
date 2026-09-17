"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  OFFICES,
  SEED_RISK,
  SEED_TRAFFIC,
  criticalCount,
  seedDetections,
  simulateDetection,
  type Detection,
  type Office,
  type Scenario,
  type Status,
} from "@/lib/demo";
import { me } from "@/lib/auth";
import { setDetectionStatus, snapshot } from "@/lib/live";

type Mode = "test" | "live";

/** Test Mode's fixtures and Live Mode's snapshot are kept in separate buckets,
 *  never merged. Sharing one would mean a toggle to Live wipes the demo and a
 *  toggle back cannot restore it — and the whole point of the switch is that
 *  both are available at once. */
interface Feed {
  all: Detection[];
  traffic: number;
  risk: number;
  org: string;
  offices: Office[];
}

interface LiveFeed extends Feed {
  sensorsTotal: number;
  sensorsLive: number;
  /** null while it is working, a message once it is not. */
  error: string | null;
  /** False until the first snapshot lands, so the console can say "connecting"
   *  rather than "nothing is happening". */
  loaded: boolean;
}

type Console = {
  detections: Detection[];
  /** unscoped, for anything that has to reason across the whole org */
  allDetections: Detection[];
  traffic: number;
  risk: number;
  threats: number;
  critical: number;
  office: string; // "all" or an office name
  setOffice: (o: string) => void;
  org: string;
  setOrg: (n: string) => void;
  offices: Office[];
  addOffice: (name: string) => void;
  removeOffice: (name: string) => void;
  addSource: (office: string, name: string) => void;
  removeSource: (office: string, name: string) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  /** Live Mode needs a session; Test Mode never does. */
  canGoLive: boolean;
  live: Pick<LiveFeed, "sensorsTotal" | "sensorsLive" | "error" | "loaded">;
  /** Re-poll now. Settings calls it after registering a sensor, so the fleet
      appears without waiting out the interval. */
  refreshLive: () => void;
  /** The id of the detection that just landed, or null. Drives the one
      narrative moment — dial seek, odometer roll, waveform spike. */
  landed: string | null;
  run: (attack: Scenario, office: string, sensor: string) => Detection;
  setStatus: (id: string, status: Status) => void;
};

const Ctx = createContext<Console | null>(null);
const KEY = "kairo.console";

/** Five seconds. The agent flushes every ten and a flow waits fifteen for its
 *  idle timeout, so polling faster than this cannot surface anything sooner —
 *  it only costs requests. Server-sent events are the upgrade when a detection
 *  needs to arrive the instant it exists. */
const POLL_MS = 5_000;

/** Every field optional: a tab left open across a deploy hands back whatever
    shape the previous build wrote. */
type Saved = Partial<{
  all: Detection[];
  traffic: number;
  risk: number;
  org: string;
  offices: Office[];
  mode: Mode;
}>;

const EMPTY_LIVE: LiveFeed = {
  all: [],
  traffic: 0,
  risk: 0,
  org: "",
  offices: [],
  sensorsTotal: 0,
  sensorsLive: 0,
  error: null,
  loaded: false,
};

export function useConsole() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsole outside DemoProvider");
  return c;
}

export default function DemoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Timestamps are relative to now, so the tree renders client-side only
  // rather than hydrating against a server clock that has already moved on.
  const [ready, setReady] = useState(false);
  const [all, setAll] = useState<Detection[]>([]);
  const [traffic, setTraffic] = useState(SEED_TRAFFIC);
  const [risk, setRisk] = useState(SEED_RISK);
  const [office, setOffice] = useState("all");
  const [landed, setLanded] = useState<string | null>(null);
  const [org, setOrg] = useState("ABC Technologies");
  const [offices, setOffices] = useState<Office[]>(OFFICES);

  const [mode, setModeState] = useState<Mode>("test");
  const [canGoLive, setCanGoLive] = useState(false);
  const [ls, setLs] = useState<LiveFeed>(EMPTY_LIVE);
  // Bumped to force a poll outside the interval.
  const [pollNonce, setPollNonce] = useState(0);

  // The guard. /dashboard has no server-side session check — Next serves the
  // shell either way — so it is this call or nothing stands between a logged
  // out tab and the console. me() both confirms the access token and, via
  // authed()'s own retry, refreshes it if only that had expired.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
      } catch {
        if (!cancelled) router.replace("/login");
        return;
      }
      if (cancelled) return;

      // Survives a reload mid-demo. sessionStorage, not local — a new tab
      // should start from the clean seed.
      const saved = sessionStorage.getItem(KEY);
      if (saved) {
        const s = JSON.parse(saved) as Saved;
        setAll(s.all ?? seedDetections(Date.now()));
        if (s.traffic) setTraffic(s.traffic);
        if (s.risk) setRisk(s.risk);
        if (s.org) setOrg(s.org);
        if (s.offices?.length) setOffices(s.offices);
        if (s.mode) setModeState(s.mode);
      } else {
        setAll(seedDetections(Date.now()));
      }
      setCanGoLive(true); // me() above already proved there is a session
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Deliberately not keyed on traffic — it ticks every 1.6s and would rewrite
  // the whole log each time for nothing.
  useEffect(() => {
    if (!ready) return;
    sessionStorage.setItem(KEY, JSON.stringify({ all, traffic, risk, org, offices, mode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, all, risk, org, offices, mode]);

  // Ambient: flows keep arriving whether or not anything is wrong. Test Mode
  // only — in Live Mode the counter is a real sum and inventing additions to
  // it would be a lie told by an animation.
  useEffect(() => {
    if (mode !== "test") return;
    const t = setInterval(() => setTraffic((n) => n + 3 + Math.floor(Math.random() * 12)), 1600);
    return () => clearInterval(t);
  }, [mode]);

  // The live feed. One request per tick returns the whole dashboard, so there
  // is nothing to reconcile: the snapshot replaces the previous one.
  useEffect(() => {
    if (!ready || mode !== "live") return;
    let cancelled = false;

    const tick = async () => {
      try {
        const s = await snapshot();
        if (cancelled) return;
        setLs({
          all: s.detections,
          traffic: s.traffic,
          // The risk index is the worst thing standing, not an average: one
          // critical detection among a hundred quiet ones is the number the
          // operator needs to see.
          risk: s.detections.reduce((m, d) => Math.max(m, d.risk), 0),
          org: s.org,
          offices: s.offices,
          sensorsTotal: s.sensors_total,
          sensorsLive: s.sensors_live,
          error: null,
          loaded: true,
        });
      } catch (err) {
        if (cancelled) return;
        // Keep the last good snapshot on screen and say the feed is stale.
        // Blanking the console because one poll failed is worse than stale.
        setLs((p) => ({
          ...p,
          error: err instanceof Error ? err.message : "The live feed is unreachable.",
        }));
      }
    };

    void tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [ready, mode, pollNonce]);

  const refreshLive = useCallback(() => setPollNonce((n) => n + 1), []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    // A stale snapshot from the last time Live was open would flash on screen
    // before the first poll answers.
    if (m === "live") setLs((p) => ({ ...p, loaded: false, error: null }));
  }, []);

  // The moment is a moment. Clear it so a second run re-fires the animations.
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setLanded(null), 1800);
    return () => clearTimeout(t);
  }, [landed]);

  const run = useCallback((attack: Scenario, o: string, sensor: string) => {
    const d = simulateDetection(attack, o, sensor);
    setAll((prev) => [d, ...prev]);
    setTraffic((n) => n + 1200 + Math.floor(Math.random() * 800));
    if (d.attack !== "Normal") setRisk((r) => Math.max(r, d.risk));
    setLanded(d.id);
    return d;
  }, []);

  const setStatus = useCallback(
    (id: string, status: Status) => {
      if (mode === "live") {
        // Optimistic: triage is a click and it should feel like one. The next
        // poll is the authority, so a rejected write corrects itself within
        // five seconds rather than needing its own error state.
        setLs((p) => ({ ...p, all: p.all.map((d) => (d.id === id ? { ...d, status } : d)) }));
        void setDetectionStatus(id, status).catch(() => setPollNonce((n) => n + 1));
        return;
      }
      setAll((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    },
    [mode],
  );

  const addOffice = useCallback((name: string) => {
    const n = name.trim();
    if (!n) return;
    setOffices((prev) => (prev.some((o) => o.name === n) ? prev : [...prev, { name: n, sensors: [] }]));
  }, []);

  const removeOffice = useCallback((name: string) => {
    setOffices((prev) => prev.filter((o) => o.name !== name));
    // detections stay — deleting an office should not erase its history
    setOffice((cur) => (cur === name ? "all" : cur));
  }, []);

  const addSource = useCallback((officeName: string, name: string) => {
    const n = name.trim();
    if (!n) return;
    setOffices((prev) =>
      prev.map((o) =>
        o.name === officeName && !o.sensors.includes(n) ? { ...o, sensors: [...o.sensors, n] } : o,
      ),
    );
  }, []);

  const removeSource = useCallback((officeName: string, name: string) => {
    setOffices((prev) =>
      prev.map((o) =>
        o.name === officeName ? { ...o, sensors: o.sensors.filter((s) => s !== name) } : o,
      ),
    );
  }, []);

  // One selection, at the edge. Everything above writes to its own bucket and
  // never has to know which mode is showing.
  const feed: Feed = mode === "live" ? ls : { all, traffic, risk, org, offices };

  const detections = useMemo(
    () => (office === "all" ? feed.all : feed.all.filter((d) => d.office === office)),
    [feed.all, office],
  );

  const value = useMemo<Console>(
    () => ({
      detections,
      traffic: feed.traffic,
      risk: feed.risk,
      threats: detections.length,
      critical: criticalCount(detections),
      office,
      setOffice,
      mode,
      setMode,
      canGoLive,
      live: {
        sensorsTotal: ls.sensorsTotal,
        sensorsLive: ls.sensorsLive,
        error: ls.error,
        loaded: ls.loaded,
      },
      refreshLive,
      landed,
      run,
      setStatus,
      allDetections: feed.all,
      org: feed.org,
      setOrg,
      offices: feed.offices,
      addOffice,
      removeOffice,
      addSource,
      removeSource,
    }),
    [
      detections,
      feed.all,
      feed.traffic,
      feed.risk,
      feed.org,
      feed.offices,
      office,
      mode,
      setMode,
      canGoLive,
      ls.sensorsTotal,
      ls.sensorsLive,
      ls.error,
      ls.loaded,
      refreshLive,
      landed,
      run,
      setStatus,
      addOffice,
      removeOffice,
      addSource,
      removeSource,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      <div className={ready ? "" : "opacity-0"}>{children}</div>
    </Ctx.Provider>
  );
}
