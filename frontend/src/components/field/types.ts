export type ScenarioType = "NORMAL" | "DDOS" | "PORTSCAN" | "BRUTEFORCE" | "BOTNET";

export interface Trajectory {
  id: string;
  d: string;
  length: number;
  duration: number;
  delay: number;
  opacity: number;
  strokeWidth: number;
  isAnomalous?: boolean;
  color?: string;
  dashArray?: string;
}

export interface NetworkNodeData {
  id: string;
  x: number;
  y: number;
  label: string;
  sublabel?: string;
  role: "sensor" | "gateway" | "core" | "edge";
  state: "calm" | "active" | "alert";
}

export interface TelemetryAnnotationData {
  id: string;
  x: number;
  y: number;
  title: string;
  value: string;
  state?: "normal" | "warning" | "critical";
  visible: boolean;
}

export interface SentinelObservation {
  state: "OBSERVING" | "ANALYZING" | "ISOLATING" | "CONTAINED";
  classification: string;
  confidence: string;
  risk: string;
  packetRate: string;
  vectorId: string;
}
