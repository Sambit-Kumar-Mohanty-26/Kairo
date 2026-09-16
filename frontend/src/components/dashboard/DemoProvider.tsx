"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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

type Mode = "test" | "live";

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
  /** The id of the detection that just landed, or null. Drives the one
      narrative moment — dial seek, odometer roll, waveform spike. */
  landed: string | null;
  run: (attack: Scenario, office: string, sensor: string) => Detection;
  setStatus: (id: string, status: Status) => void;
};

const Ctx = createContext<Console | null>(null);
const KEY = "kairo.console";

/** Every field optional: a tab left open across a deploy hands back whatever
    shape the previous build wrote. */
type Saved = Partial<{
  all: Detection[];
  traffic: number;
  risk: number;
  org: string;
  offices: Office[];
}>;

export function useConsole() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsole outside DemoProvider");
  return c;
}

export default function DemoProvider({ children }: { children: React.ReactNode }) {
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

  // Survives a reload mid-demo. sessionStorage, not local — a new tab should
  // start from the clean seed.
  useEffect(() => {
    const saved = sessionStorage.getItem(KEY);
    if (saved) {
      const s = JSON.parse(saved) as Saved;
      setAll(s.all ?? seedDetections(Date.now()));
      if (s.traffic) setTraffic(s.traffic);
      if (s.risk) setRisk(s.risk);
      if (s.org) setOrg(s.org);
      if (s.offices?.length) setOffices(s.offices);
    } else {
      setAll(seedDetections(Date.now()));
    }
    setReady(true);
  }, []);

  // Deliberately not keyed on traffic — it ticks every 1.6s and would rewrite
  // the whole log each time for nothing.
  useEffect(() => {
    if (!ready) return;
    sessionStorage.setItem(KEY, JSON.stringify({ all, traffic, risk, org, offices }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, all, risk, org, offices]);

  // Ambient: flows keep arriving whether or not anything is wrong.
  useEffect(() => {
    const t = setInterval(() => setTraffic((n) => n + 3 + Math.floor(Math.random() * 12)), 1600);
    return () => clearInterval(t);
  }, []);

  const run = useCallback((attack: Scenario, o: string, sensor: string) => {
    const d = simulateDetection(attack, o, sensor);
    setAll((prev) => [d, ...prev]);
    setTraffic((n) => n + 1200 + Math.floor(Math.random() * 800));
    if (d.attack !== "Normal") setRisk((r) => Math.max(r, d.risk));
    setLanded(d.id);
    return d;
  }, []);

  // The moment is a moment. Clear it so a second run re-fires the animations.
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setLanded(null), 1800);
    return () => clearTimeout(t);
  }, [landed]);

  const setStatus = useCallback((id: string, status: Status) => {
    setAll((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  }, []);

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

  const detections = useMemo(
    () => (office === "all" ? all : all.filter((d) => d.office === office)),
    [all, office],
  );

  const value = useMemo<Console>(
    () => ({
      detections,
      traffic,
      risk,
      threats: detections.length,
      critical: criticalCount(detections),
      office,
      setOffice,
      mode: "test",
      landed,
      run,
      setStatus,
      allDetections: all,
      org,
      setOrg,
      offices,
      addOffice,
      removeOffice,
      addSource,
      removeSource,
    }),
    [
      detections,
      all,
      traffic,
      risk,
      office,
      landed,
      run,
      setStatus,
      org,
      offices,
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
