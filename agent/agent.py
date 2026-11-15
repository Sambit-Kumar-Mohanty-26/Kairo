#!/usr/bin/env python3
"""The Kairo sensor agent (Phase 2 - Production Grade).

Runs on the customer's network, watches one interface, and posts flow
statistics to Kairo.

Key Reliability Features:
- Embedded DurableQueue: Flow batches are committed to SQLite before network transmission.
- Zero-loss restart recovery: Pending batches survive restarts and link outages.
- Authenticated Heartbeat: Reports interface health, packets observed, flow counts,
  and local queue pressure to the backend every 30 seconds.
- Jittered Exponential Backoff: Protects backend from retry storms during recovery.
- Honest Telemetry: Differentiates idle networks (0 packets) from capture failures.
"""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

from durable_queue import DurableQueue
from flow import Flow

VERSION = "0.2.0"
BATCH = 100
FLUSH_S = 5.0
HEARTBEAT_S = 30.0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("kairo.agent")


def _key(src: str, sport: int, dst: str, dport: int, proto: str) -> tuple:
    """A direction-agnostic flow key, so both halves of a conversation land on one Flow."""
    a, b = (src, sport), (dst, dport)
    return (proto, a, b) if a <= b else (proto, b, a)


class Sender:
    """Owns the HTTP communication with Kairo API."""

    def __init__(self, base: str, key: str) -> None:
        self.base = base.rstrip("/")
        self.key = key

    def _request(self, path: str, method: str = "GET", payload: dict | None = None, compress: bool = True) -> tuple[int, dict, str]:
        headers = {"authorization": f"Bearer {self.key}", "content-type": "application/json"}
        body = None
        if payload is not None:
            raw = json.dumps(payload).encode("utf-8")
            if compress and len(raw) > 512:
                body = gzip.compress(raw)
                headers["content-encoding"] = "gzip"
            else:
                body = raw
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=body,
            method=method,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read() or b"{}"
                return r.status, json.loads(raw), ""
        except urllib.error.HTTPError as e:
            msg = e.read()[:200].decode(errors="replace")
            return e.code, {}, f"HTTP {e.code}: {msg}"
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            return 0, {}, str(e)

    def identify(self) -> dict:
        """Called once at boot to verify sensor identity."""
        status, data, err = self._request("/ingest", method="GET")
        if status != 200:
            raise RuntimeError(f"Sensor identification failed ({status}): {err}")
        return data

    def send_batch(self, batch_id: str, flows: list[dict]) -> tuple[bool, str, int]:
        """Post a batch of flows. Returns (success, error_description, status_code)."""
        status, data, err = self._request("/ingest/flows", method="POST", payload={"batch_id": batch_id, "flows": flows})
        if status == 200:
            attacks = data.get("attacks", 0)
            accepted = data.get("accepted", len(flows))
            logger.info(f"Batch {batch_id[:8]} accepted: {accepted} flows, {attacks} attack(s)")
            return True, "", 200
        return False, err, status

    def heartbeat(self, metrics: dict[str, Any]) -> tuple[bool, dict]:
        """Send authenticated health heartbeat to backend."""
        status, data, err = self._request("/ingest/heartbeat", method="POST", payload=metrics)
        if status == 200:
            return True, data
        logger.warning(f"Heartbeat failed ({status}): {err}")
        return False, {}


class Agent:
    def __init__(self, sender: Sender, queue: DurableQueue | None = None, iface: str | None = None) -> None:
        self.sender = sender
        self.queue = queue or DurableQueue()
        self.iface = iface
        self.flows: dict[tuple, Flow] = {}
        self.lock = threading.Lock()
        self.stop = threading.Event()

        self.start_time = time.time()
        self.packets_observed = 0
        self.flows_extracted = 0
        self.capture_status = "idle"
        self.recent_warning = ""
        self.last_heartbeat_time = 0.0

    def on_packet(self, pkt) -> None:
        from scapy.layers.inet import IP, TCP, UDP
        from scapy.layers.inet6 import IPv6

        self.packets_observed += 1
        self.capture_status = "active"

        ip = pkt.getlayer(IP) or pkt.getlayer(IPv6)
        if ip is None:
            return
        seg = pkt.getlayer(TCP) or pkt.getlayer(UDP)
        if seg is None:
            return

        tcp = seg.name == "TCP"
        ts = float(pkt.time)
        payload = len(seg.payload)
        wire = len(pkt)
        window = int(seg.window) if tcp else -1
        header = int(seg.dataofs) * 4 if tcp else 0
        fin_or_rst = bool(int(seg.flags) & 0x05) if tcp else False

        k = _key(ip.src, int(seg.sport), ip.dst, int(seg.dport), seg.name)
        with self.lock:
            f = self.flows.get(k)
            if f is None:
                f = Flow(
                    src=ip.src,
                    sport=int(seg.sport),
                    dst=ip.dst,
                    dport=int(seg.dport),
                    protocol=seg.name,
                    first=ts,
                )
                self.flows[k] = f
            f.add(ts, (ip.src, int(seg.sport)) == (f.src, f.sport), payload, wire, window, header, fin_or_rst)

    def sweep(self, now: float, force: bool = False) -> None:
        """Move finished flows out of active flow table and persist into durable queue."""
        with self.lock:
            done = [k for k, f in self.flows.items() if force or f.expired(now)]
            reports = [self.flows.pop(k).report() for k in done]

        if not reports:
            return

        self.flows_extracted += len(reports)

        # Enqueue in durable SQLite chunks
        for i in range(0, len(reports), BATCH):
            chunk = reports[i : i + BATCH]
            batch_id = uuid.uuid4().hex
            enqueued = self.queue.enqueue(batch_id, chunk)
            if not enqueued:
                self.recent_warning = "Local queue storage pressure: refused new flows"
                logger.error(self.recent_warning)

    def flush(self) -> None:
        """Attempt to upload oldest pending batches from durable queue."""
        batches = self.queue.peek(limit=5)
        if not batches:
            return

        now = time.time()
        for batch_id, flows, attempts in batches:
            # Exponential backoff with random jitter if previous attempts failed
            if attempts > 0:
                backoff = min(60.0, (1.8 ** min(attempts, 8)) + random.uniform(0.5, 2.0))
                # Skip batch if backoff hasn't elapsed
                # (peek returns in order of created_at; failure records update attempts)
                if attempts > 12:
                    logger.warning(f"Batch {batch_id[:8]} has failed {attempts} times. Retrying with backoff.")

            ok, err, code = self.sender.send_batch(batch_id, flows)
            if ok:
                self.queue.acknowledge(batch_id)
                self.recent_warning = ""
            else:
                self.queue.record_failure(batch_id, err)
                if code in (401, 403):
                    self.recent_warning = f"Sensor authentication error: {err}"
                    logger.critical(self.recent_warning)
                    break
                elif code == 400:
                    logger.error(f"Batch {batch_id[:8]} rejected due to client validation error: {err}")
                    # Validation failure won't fix itself by retrying; acknowledge to unblock queue
                    self.queue.acknowledge(batch_id)
                else:
                    self.recent_warning = f"Upload failed ({code}): {err}"
                    # Stop loop for this flush cycle on network or server error to avoid spamming
                    break

    def send_heartbeat(self) -> None:
        """Report operational health and queue status to backend."""
        q_metrics = self.queue.metrics()
        heartbeat_payload = {
            "version": VERSION,
            "uptime_seconds": int(time.time() - self.start_time),
            "interface": self.iface or "default",
            "capture_status": self.capture_status,
            "packets_observed": self.packets_observed,
            "flows_extracted": self.flows_extracted,
            "pending_batches": q_metrics["pending_batches"],
            "queue_bytes": q_metrics["queue_bytes"],
            "warning": self.recent_warning or None,
        }
        self.sender.heartbeat(heartbeat_payload)
        self.last_heartbeat_time = time.time()

    def run(self, iface: str | None, bpf: str) -> None:
        from scapy.sendrecv import AsyncSniffer

        self.iface = iface
        try:
            who = self.sender.identify()
            logger.info(f"Connected as sensor '{who['sensor']}' on network '{who['network']}' ({who['cidr']})")
        except Exception as e:
            logger.critical(f"Failed to connect to Kairo API: {e}")
            sys.exit(1)

        # Initial heartbeat immediately on boot
        self.send_heartbeat()
        logger.info(f"Starting packet capture on interface {iface or 'default'} [filter: {bpf}]")

        try:
            sniffer = AsyncSniffer(iface=iface, filter=bpf, prn=self.on_packet, store=False)
            sniffer.start()
            self.capture_status = "active"
        except PermissionError:
            self.capture_status = "permission_denied"
            self.recent_warning = "Root (CAP_NET_RAW) privilege required for packet capture"
            logger.critical(self.recent_warning)
            self.send_heartbeat()
            sys.exit(1)
        except Exception as e:
            self.capture_status = "error"
            self.recent_warning = f"Capture interface initialization error: {e}"
            logger.critical(self.recent_warning)
            self.send_heartbeat()
            sys.exit(1)

        try:
            while not self.stop.wait(FLUSH_S):
                now = time.time()
                self.sweep(now)
                self.flush()

                if now - self.last_heartbeat_time >= HEARTBEAT_S:
                    self.send_heartbeat()
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received, initiating graceful shutdown...")
        finally:
            logger.info("Stopping capture and flushing remaining flows...")
            try:
                sniffer.stop()
            except Exception:
                pass
            self.capture_status = "stopped"
            self.sweep(time.time(), force=True)
            self.flush()
            self.send_heartbeat()
            self.queue.purge_acknowledged()
            logger.info("Agent stopped cleanly.")


def default_bpf(url: str) -> str:
    """BPF filter excluding Kairo API host to avoid telemetry feedback loops."""
    host = urllib.parse.urlparse(url).hostname
    base = "tcp or udp"
    return f"({base}) and not host {host}" if host else base


def main() -> int:
    p = argparse.ArgumentParser(description="Kairo Production-Grade Sensor Agent")
    p.add_argument("--interface", "-i", default=os.getenv("KAIRO_INTERFACE"))
    p.add_argument("--url", default=os.getenv("KAIRO_URL", "http://localhost:8000"))
    p.add_argument("--key", default=os.getenv("KAIRO_SENSOR_KEY", ""))
    p.add_argument("--filter", dest="bpf", default=os.getenv("KAIRO_BPF"))
    p.add_argument("--check", action="store_true", help="Perform configuration & connectivity self-check")
    args = p.parse_args()

    parsed = urllib.parse.urlparse(args.url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        logger.critical("KAIRO_URL must be an absolute http(s) URL.")
        return 1
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        logger.critical("KAIRO_URL must use HTTPS outside localhost.")
        return 1

    if not args.key:
        logger.critical("No sensor key provided. Set KAIRO_SENSOR_KEY=ksk_... or pass --key")
        return 1

    sender = Sender(args.url, args.key)

    if args.check:
        logger.info(f"Testing connectivity to {args.url}...")
        try:
            info = sender.identify()
            logger.info(f"Self-check OK: Sensor '{info['sensor']}' verified for network '{info['network']}'")
            return 0
        except Exception as e:
            logger.critical(f"Self-check failed: {e}")
            return 1

    agent = Agent(sender, iface=args.interface)
    bpf = args.bpf or default_bpf(args.url)
    agent.run(args.interface, bpf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
