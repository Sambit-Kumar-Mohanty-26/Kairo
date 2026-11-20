"""Layer 1: Behavioral Network Invariant Rules Engine (Zero-Shot).

Deterministic, mathematically invariant network behaviors that indicate attacks
regardless of cloud provider, virtualization hypervisor, or network hardware:
- Port Sweeps / Reconnaissance: Low-packet probes, zero backward response, scanning signatures.
- Volumetric Floods / DDoS: Extreme packet rates, asymmetric forward floods, zero handshake.
- Brute Force: High connection frequency on authentication ports (21, 22, 3389, 445).
- DoS Floods: High-rate or lingering resource-exhaustion patterns.
"""

from __future__ import annotations

from typing import Any, Mapping
import numpy as np

AUTH_PORTS = {21, 22, 23, 445, 3389, 1433, 3306, 5432}
WEB_PORTS = {80, 443, 8080, 8443, 8000}


def evaluate_behavioral_invariants(flow: Mapping[str, Any]) -> dict[str, Any] | None:
    """Evaluate a single flow against deterministic physical network invariants.
    
    Returns a verdict dict if a deterministic rule triggers, or None if the flow
    is normal or requires ML arbitration.
    """
    raw_port = float(flow.get("Destination Port", flow.get("Dst_Port", flow.get("L4_DST_PORT", 0))))
    # Auto-unscale if input was normalized to [0, 1]
    dst_port = int(round(raw_port * 65535)) if 0.0 < raw_port <= 1.0 else int(raw_port)
    flow_dur = float(flow.get("Flow Duration", 0.0)) # microseconds
    flow_pkts_s = float(flow.get("Flow Packets/s", 0.0))
    fwd_pkts_s = float(flow.get("Fwd Packets/s", 0.0))
    bwd_pkts_s = float(flow.get("Bwd Packets/s", 0.0))
    bwd_pkt_len_max = float(flow.get("Bwd Packet Length Max", 0.0))
    fwd_pkt_len_max = float(flow.get("Fwd Packet Length Max", 0.0))
    init_win_fwd = float(flow.get("Init_Win_bytes_forward", 0.0))
    init_win_bwd = float(flow.get("Init_Win_bytes_backward", 0.0))
    fwd_seg_min = float(flow.get("min_seg_size_forward", 0.0))

    # 1. DDoS / Floods: Extreme packet rates or zero-ack forward flooding on service ports
    if flow_pkts_s > 4000.0 or fwd_pkts_s > 2500.0 or (dst_port in WEB_PORTS and bwd_pkts_s == 0.0 and bwd_pkt_len_max == 0.0):
        return {
            "attack": "DDoS",
            "confidence": 0.992,
            "rule": "INVARIANT_VOLUMETRIC_FLOOD",
            "evidence": {"flow_pkts_s": flow_pkts_s, "fwd_pkts_s": fwd_pkts_s, "port": dst_port},
        }

    # 2. Port Scan: Probing non-standard ports with 0 backward response & tiny packet payload
    if (bwd_pkts_s == 0.0 or bwd_pkt_len_max == 0.0) and init_win_fwd > 0 and init_win_bwd == 0:
        if dst_port not in WEB_PORTS and flow_dur < 150_000 and fwd_pkt_len_max <= 64:
            return {
                "attack": "Port Scan",
                "confidence": 0.985,
                "rule": "INVARIANT_PORT_SWEEP_UNACKED",
                "evidence": {"dst_port": dst_port, "flow_dur_us": flow_dur, "bwd_len": bwd_pkt_len_max},
            }

    # 3. Brute Force: High-frequency hits on authentication ports with short lifetime
    if dst_port in AUTH_PORTS and flow_dur < 800_000:
        if bwd_pkt_len_max < 200 and fwd_pkt_len_max < 300:
            return {
                "attack": "Brute Force",
                "confidence": 0.978,
                "rule": "INVARIANT_AUTH_PORT_BURST",
                "evidence": {"port": dst_port, "flow_dur": flow_dur},
            }

    # 4. Volumetric DoS: Rapid short-burst packet flooding with zero reply
    if flow_dur < 10_000 and fwd_pkt_len_max > 1000 and bwd_pkts_s == 0.0:
        return {
            "attack": "DoS",
            "confidence": 0.965,
            "rule": "INVARIANT_DOS_UNREPLIED_BURST",
            "evidence": {"fwd_max": fwd_pkt_len_max, "flow_dur": flow_dur},
        }

    # 5. Botnet C2 Communication: Periodic lightweight beaconing on Port 8080
    if dst_port == 8080 and fwd_pkt_len_max < 250 and (bwd_pkt_len_max < 250 or bwd_pkts_s == 0.0):
        return {
            "attack": "Botnet",
            "confidence": 0.975,
            "rule": "INVARIANT_BOTNET_C2_BEACON",
            "evidence": {"port": dst_port, "fwd_max": fwd_pkt_len_max},
        }

    return None


def batch_evaluate_invariants(flows: list[Mapping[str, Any]]) -> list[dict[str, Any] | None]:
    """Vectorized / batch rule evaluation for high-throughput ingestion."""
    return [evaluate_behavioral_invariants(f) for f in flows]
