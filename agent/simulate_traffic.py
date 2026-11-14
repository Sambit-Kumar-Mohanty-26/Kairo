#!/usr/bin/env python3
"""Interactive Live Mode traffic & telemetry simulator for Kairo.

Allows testing the entire Live Mode experience (Sensors, Heartbeats,
Flow Ingestion, ML Cascading, Risk Dial, and Alerts) on any machine
without requiring root packet capture privileges or raw network TAPs.

Usage:
    python agent/simulate_traffic.py --key ksk_... --url http://localhost:8000
"""

from __future__ import annotations

import argparse
import datetime
import json
import random
import sys
import time
import urllib.error
import urllib.request
import uuid

# 30-feature baseline template matching ML cascade contract
BASE_FEATURES = {
    "Packet Length Mean": 450.0,
    "Packet Length Variance": 125000.0,
    "Init_Win_bytes_backward": 65535.0,
    "Fwd Packet Length Max": 1460.0,
    "Bwd Packet Length Max": 1460.0,
    "Init_Win_bytes_forward": 64240.0,
    "Fwd Packet Length Mean": 320.0,
    "Flow Duration": 1200000.0,
    "Destination Port": 443.0,
    "Bwd Packets/s": 45.0,
    "Fwd IAT Mean": 25000.0,
    "Fwd Packets/s": 50.0,
    "Flow Packets/s": 95.0,
    "Flow IAT Mean": 12000.0,
    "Flow IAT Std": 8500.0,
    "Fwd IAT Std": 12000.0,
    "Bwd IAT Total": 900000.0,
    "Bwd IAT Mean": 22000.0,
    "min_seg_size_forward": 20.0,
    "Bwd Packet Length Min": 40.0,
    "Bwd IAT Std": 7500.0,
    "Fwd IAT Min": 100.0,
    "Bwd IAT Min": 120.0,
    "Idle Min": 0.0,
    "Min Packet Length": 40.0,
    "Flow IAT Min": 50.0,
    "Fwd Packet Length Min": 40.0,
    "Active Min": 0.0,
    "Active Mean": 0.0,
    "Active Max": 0.0,
}


def make_syn_flood_flow() -> dict:
    f = dict(BASE_FEATURES)
    f["Destination Port"] = 80.0
    f["Flow Duration"] = 45000.0
    f["Flow Packets/s"] = 4500.0
    f["Fwd Packets/s"] = 4500.0
    f["Bwd Packets/s"] = 0.0
    f["Init_Win_bytes_forward"] = 1024.0
    f["Init_Win_bytes_backward"] = -1.0
    f["Packet Length Mean"] = 54.0
    f["Packet Length Variance"] = 0.0
    f["Fwd Packet Length Max"] = 54.0
    f["Fwd Packet Length Min"] = 54.0
    f["Bwd Packet Length Max"] = 0.0
    f["Bwd Packet Length Min"] = 0.0
    f["min_seg_size_forward"] = 32.0

    return {
        "id": uuid.uuid4().hex[:16],
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source_ip": f"198.51.100.{random.randint(10, 250)}",
        "source_port": random.randint(1024, 65535),
        "target_ip": "10.20.1.10",
        "target_port": 80,
        "protocol": "TCP",
        "bytes": 54 * random.randint(20, 80),
        "features": f,
    }


def make_port_scan_flow() -> dict:
    f = dict(BASE_FEATURES)
    dport = random.choice([21, 22, 23, 25, 80, 110, 139, 443, 445, 1433, 3306, 3389, 8080])
    f["Destination Port"] = float(dport)
    f["Flow Duration"] = 15000.0
    f["Flow Packets/s"] = 120.0
    f["Fwd Packets/s"] = 120.0
    f["Bwd Packets/s"] = 0.0
    f["Init_Win_bytes_forward"] = 1024.0
    f["Init_Win_bytes_backward"] = -1.0
    f["Packet Length Mean"] = 44.0
    f["Packet Length Variance"] = 0.0
    f["min_seg_size_forward"] = 24.0

    return {
        "id": uuid.uuid4().hex[:16],
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source_ip": f"203.0.113.{random.randint(1, 50)}",
        "source_port": random.randint(30000, 60000),
        "target_ip": "10.20.1.15",
        "target_port": dport,
        "protocol": "TCP",
        "bytes": 44 * 2,
        "features": f,
    }


def make_normal_flow() -> dict:
    f = dict(BASE_FEATURES)
    f["Destination Port"] = 443.0
    f["Flow Duration"] = random.uniform(500000.0, 3000000.0)
    f["Packet Length Mean"] = random.uniform(300.0, 850.0)
    f["Packet Length Variance"] = random.uniform(80000.0, 200000.0)
    f["Init_Win_bytes_forward"] = 64240.0
    f["Init_Win_bytes_backward"] = 65535.0

    return {
        "id": uuid.uuid4().hex[:16],
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source_ip": f"10.20.1.{random.randint(100, 200)}",
        "source_port": random.randint(10240, 65000),
        "target_ip": "104.21.55.2",
        "target_port": 443,
        "protocol": "TCP",
        "bytes": random.randint(2000, 15000),
        "features": f,
    }


def post(url: str, key: str, payload: dict | None, method: str = "POST") -> tuple[int, dict]:
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"authorization": f"Bearer {key}", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()[:200].decode(errors="replace")
        print(f"[!] HTTP Error {e.code}: {raw}", file=sys.stderr)
        return e.code, {}
    except Exception as e:
        print(f"[!] Request failed: {e}", file=sys.stderr)
        return 0, {}


def main():
    parser = argparse.ArgumentParser(description="Kairo Live Mode Traffic Simulator")
    parser.add_argument("--key", required=True, help="Sensor key (ksk_...) from Settings > Connect your network")
    parser.add_argument("--url", default="http://localhost:8000", help="Kairo API base URL (default: http://localhost:8000)")
    parser.add_argument("--bursts", type=int, default=10, help="Number of telemetry batches to send")
    parser.add_argument("--attack-prob", type=float, default=0.35, help="Probability of attack flows in a batch")
    args = parser.parse_args()

    base = args.url.rstrip("/")
    print(f"[*] Connecting to Kairo API at {base}...")
    status, who = post(f"{base}/ingest", args.key, None, method="GET")
    if status != 200:
        print("[!] Failed to authenticate sensor key. Make sure the API is running and key is valid.", file=sys.stderr)
        sys.exit(1)

    print(f"[+] Authenticated as sensor: '{who['sensor']}' on '{who['network']}' ({who['cidr']})")

    # Send initial heartbeat
    uptime = 10
    total_packets = 0
    total_flows = 0

    print("[*] Sending operational heartbeat...")
    post(
        f"{base}/ingest/heartbeat",
        args.key,
        {
            "version": "0.2.0",
            "uptime_seconds": uptime,
            "interface": "eth0 (simulated)",
            "capture_status": "active",
            "packets_observed": 100,
            "flows_extracted": 10,
            "pending_batches": 0,
            "queue_bytes": 0,
            "warning": None,
        },
    )

    print(f"[*] Commencing transmission of {args.bursts} flow batches into Live Mode...")
    for i in range(1, args.bursts + 1):
        flows = []
        batch_size = random.randint(8, 25)

        for _ in range(batch_size):
            if random.random() < args.attack_prob:
                attack_type = random.choice(["syn_flood", "port_scan"])
                flow = make_syn_flood_flow() if attack_type == "syn_flood" else make_port_scan_flow()
            else:
                flow = make_normal_flow()
            flows.append(flow)

        batch_id = uuid.uuid4().hex
        status, res = post(f"{base}/ingest/flows", args.key, {"batch_id": batch_id, "flows": flows})

        if status == 200:
            accepted = res.get("accepted", len(flows))
            attacks = res.get("attacks", 0)
            total_flows += accepted
            total_packets += accepted * 12
            print(f"  -> Batch {i:02d}/{args.bursts:02d} [{batch_id[:8]}]: {accepted} flows, {attacks} attack(s) detected")
        else:
            print(f"  -> Batch {i:02d} failed with status {status}")

        # Periodic heartbeat
        if i % 3 == 0:
            post(
                f"{base}/ingest/heartbeat",
                args.key,
                {
                    "version": "0.2.0",
                    "uptime_seconds": uptime + (i * 2),
                    "interface": "eth0 (simulated)",
                    "capture_status": "active",
                    "packets_observed": total_packets,
                    "flows_extracted": total_flows,
                    "pending_batches": 0,
                    "queue_bytes": 0,
                    "warning": None,
                },
            )

        time.sleep(1.5)

    print(f"\n[✓] Simulation completed! Sent {total_flows} total flows across {args.bursts} batches.")
    print("Open http://localhost:3000/dashboard in your browser to view the real-time Live Mode detections and Risk Dial!")


if __name__ == "__main__":
    main()
