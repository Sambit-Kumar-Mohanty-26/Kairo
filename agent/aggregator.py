"""Kairo Edge Sensor Aggregator & LAN Gateway.

Enterprise deployment pattern:
In an office, university campus, or industrial plant with 10 to 200+ sensors,
having every sensor open individual HTTPS connections across the WAN internet
causes NAT connection exhaustion, high TLS handshake overhead, and failure
during WAN outages.

The Aggregator runs locally on the campus LAN (e.g., on a local server or gateway PC):
1. Sensors stream flow batches and heartbeats over local LAN (sub-millisecond, $0 bandwidth).
2. The Aggregator provides instantaneous 200/202 responses to local sensors.
3. It bundles and compresses flows into micro-batched uplinks.
4. If WAN internet drops, it buffers all telemetry locally in SQLite WAL.
5. Once internet returns, it automatically drains the buffer to the Kairo Cloud.

Usage:
    python -m agent.aggregator --upstream https://kairo-api.onrender.com/api --port 8080
"""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Aggregator]: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("kairo.aggregator")


class AggregatorBuffer:
    """Thread-safe SQLite persistent buffer for WAN outage survivability."""

    def __init__(self, db_path: str = "aggregator_buffer.db", max_size_mb: int = 500) -> None:
        self.db_path = db_path
        self.max_bytes = max_size_mb * 1024 * 1024
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS pending_uplinks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    endpoint TEXT NOT NULL,
                    auth_header TEXT NOT NULL,
                    payload BLOB NOT NULL,
                    is_gzipped INTEGER DEFAULT 1,
                    created_at REAL NOT NULL,
                    attempts INTEGER DEFAULT 0
                )
                """
            )
            conn.commit()
            conn.close()

    def push(self, endpoint: str, auth_header: str, payload_dict: dict[str, Any]) -> None:
        raw_json = json.dumps(payload_dict).encode("utf-8")
        compressed = gzip.compress(raw_json)
        now = time.time()

        with self._lock:
            conn = sqlite3.connect(self.db_path)
            # Cap check: if database size exceeded, drop oldest
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*), SUM(LENGTH(payload)) FROM pending_uplinks")
            row = cur.fetchone()
            current_bytes = (row[1] or 0) if row else 0

            if current_bytes + len(compressed) > self.max_bytes:
                logger.warning("Local buffer exceeded capacity cap (%d MB). Dropping oldest batches.", self.max_bytes // (1024 * 1024))
                cur.execute("DELETE FROM pending_uplinks WHERE id IN (SELECT id FROM pending_uplinks ORDER BY id ASC LIMIT 50)")

            cur.execute(
                "INSERT INTO pending_uplinks (endpoint, auth_header, payload, is_gzipped, created_at) VALUES (?, ?, ?, 1, ?)",
                (endpoint, auth_header, compressed, now),
            )
            conn.commit()
            conn.close()

    def pop_batch(self, limit: int = 10) -> list[dict[str, Any]]:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            cur.execute(
                "SELECT id, endpoint, auth_header, payload, is_gzipped FROM pending_uplinks ORDER BY id ASC LIMIT ?",
                (limit,),
            )
            rows = cur.fetchall()
            conn.close()

            items = []
            for r in rows:
                items.append({
                    "id": r[0],
                    "endpoint": r[1],
                    "auth_header": r[2],
                    "payload": r[3],
                    "is_gzipped": bool(r[4]),
                })
            return items

    def remove(self, item_ids: list[int]) -> None:
        if not item_ids:
            return
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            placeholders = ",".join("?" * len(item_ids))
            conn.execute(f"DELETE FROM pending_uplinks WHERE id IN ({placeholders})", item_ids)
            conn.commit()
            conn.close()

    def count(self) -> int:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM pending_uplinks")
            c = cur.fetchone()[0]
            conn.close()
            return c


class AggregatorState:
    """Thread-safe telemetry metrics counter."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.sensors_seen: set[str] = set()
        self.flows_received: int = 0
        self.flows_forwarded: int = 0
        self.bytes_lan_received: int = 0
        self.bytes_wan_sent: int = 0
        self.uplink_status: str = "INITIALIZING"
        self.last_uplink_time: float = 0.0

    def record_incoming(self, sensor_key: str, flow_count: int, raw_bytes: int) -> None:
        with self.lock:
            self.sensors_seen.add(sensor_key[-8:])
            self.flows_received += flow_count
            self.bytes_lan_received += raw_bytes

    def record_forwarded(self, flow_count: int, wan_bytes: int) -> None:
        with self.lock:
            self.flows_forwarded += flow_count
            self.bytes_wan_sent += wan_bytes
            self.uplink_status = "HEALTHY"
            self.last_uplink_time = time.time()

    def get_stats(self, buffer_count: int) -> dict[str, Any]:
        with self.lock:
            savings_pct = 0.0
            if self.bytes_lan_received > 0:
                savings_pct = max(0.0, (1.0 - (self.bytes_wan_sent / self.bytes_lan_received)) * 100.0)

            return {
                "uplink_status": self.uplink_status,
                "connected_sensors_count": len(self.sensors_seen),
                "total_flows_received": self.flows_received,
                "total_flows_forwarded": self.flows_forwarded,
                "buffered_batches_pending": buffer_count,
                "lan_bytes_in": self.bytes_lan_received,
                "wan_bytes_out": self.bytes_wan_sent,
                "bandwidth_savings_pct": round(savings_pct, 1),
                "last_uplink_ts": self.last_uplink_time,
            }


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def make_request_handler(upstream_base: str, buffer: AggregatorBuffer, state: AggregatorState):

    class AggregatorHandler(BaseHTTPRequestHandler):

        def log_message(self, format: str, *args: Any) -> None:
            # Suppress default noisy access logs, keep custom logging
            pass

        def _send_json(self, status_code: int, data: dict[str, Any]) -> None:
            raw = json.dumps(data).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            clean_path = parsed.path.rstrip("/")

            # Local aggregator health & telemetry status
            if clean_path in ("/stats", "/api/stats", "/health"):
                stats = state.get_stats(buffer.count())
                self._send_json(200, {"ok": True, "aggregator": "kairo-edge-v1", "stats": stats})
                return

            # Identity handshake relay (/ingest or /api/ingest)
            if clean_path.endswith("/ingest"):
                auth = self.headers.get("Authorization", "")
                target_url = f"{upstream_base}/ingest"
                try:
                    req = urllib.request.Request(target_url, headers={"Authorization": auth}, method="GET")
                    with urllib.request.urlopen(req, timeout=10) as r:
                        resp_data = json.loads(r.read())
                        self._send_json(r.status, resp_data)
                except urllib.error.HTTPError as e:
                    self._send_json(e.code, {"error": f"Upstream rejected identity: {e.reason}"})
                except Exception as e:
                    # In offline mode, allow local sensors to boot without crashing!
                    logger.warning("WAN unreachable during sensor identify, returning offline optimistic ack: %s", e)
                    self._send_json(200, {"sensor": "cached-sensor", "network": "offline-edge", "cidr": "0.0.0.0/0"})
                return

            self._send_json(404, {"error": "Not Found"})

        def do_POST(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            clean_path = parsed.path.rstrip("/")
            auth = self.headers.get("Authorization", "")

            # 1. Heartbeats
            if clean_path.endswith("/heartbeat"):
                content_len = int(self.headers.get("Content-Length", 0))
                raw_body = self.rfile.read(content_len) if content_len > 0 else b"{}"
                try:
                    payload = json.loads(raw_body)
                except json.JSONDecodeError:
                    payload = {}

                # Buffer heartbeat to forward asynchronously
                buffer.push("/ingest/heartbeat", auth, payload)
                self._send_json(200, {"ok": True, "relayed": True, "buffered": True})
                return

            # 2. Flow Ingestion (/ingest/flows)
            if clean_path.endswith("/flows") or clean_path.endswith("/ingest"):
                content_len = int(self.headers.get("Content-Length", 0))
                encoding = self.headers.get("Content-Encoding", "").lower()
                raw_body = self.rfile.read(content_len) if content_len > 0 else b""

                if encoding == "gzip":
                    try:
                        raw_body = gzip.decompress(raw_body)
                    except Exception as e:
                        self._send_json(400, {"error": f"Invalid gzip compression: {e}"})
                        return

                try:
                    payload = json.loads(raw_body.decode("utf-8"))
                except Exception as e:
                    self._send_json(400, {"error": f"Malformed JSON: {e}"})
                    return

                flows = payload.get("flows", [])
                state.record_incoming(auth, len(flows), len(raw_body))

                # Push directly to SQLite WAL buffer
                buffer.push("/ingest/flows", auth, payload)

                # Return instantaneous 202 Accepted to local sensor over LAN
                self._send_json(202, {
                    "accepted": len(flows),
                    "status": "buffered_at_edge",
                    "queue_depth": buffer.count(),
                })
                return

            self._send_json(404, {"error": "Endpoint Not Supported"})

    return AggregatorHandler


def uplink_worker(upstream_base: str, buffer: AggregatorBuffer, state: AggregatorState, stop_event: threading.Event) -> None:
    """Background thread that flushes buffered telemetry batches to the Kairo Cloud."""
    logger.info("Uplink worker started. Targeting cloud: %s", upstream_base)

    while not stop_event.is_set():
        batch = buffer.pop_batch(limit=10)
        if not batch:
            time.sleep(1.0)
            continue

        success_ids = []
        for item in batch:
            endpoint = item["endpoint"]
            auth_header = item["auth_header"]
            payload_data = item["payload"]
            is_gzipped = item["is_gzipped"]

            # Add ?async=true query param for flows to trigger non-blocking cloud worker
            query_param = "?async=true" if endpoint.endswith("/flows") else ""
            target_url = f"{upstream_base}{endpoint}{query_param}"

            headers = {
                "Authorization": auth_header,
                "Content-Type": "application/json",
            }
            if is_gzipped:
                headers["Content-Encoding"] = "gzip"

            try:
                req = urllib.request.Request(
                    target_url,
                    data=payload_data,
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=15) as r:
                    if r.status in (200, 201, 202):
                        success_ids.append(item["id"])
                        # Track telemetry for reporting
                        try:
                            flows_count = 0
                            if is_gzipped:
                                decomp = json.loads(gzip.decompress(payload_data))
                                flows_count = len(decomp.get("flows", []))
                            state.record_forwarded(flows_count, len(payload_data))
                        except Exception:
                            pass
                    else:
                        logger.warning("Upstream responded with status %d", r.status)
            except urllib.error.HTTPError as e:
                # 400 or 422 indicates bad flow data — remove to prevent poison pills
                if e.code in (400, 422):
                    logger.error("Upstream rejected malformed batch with %d. Dropping poison pill.", e.code)
                    success_ids.append(item["id"])
                elif e.code == 429:
                    logger.warning("Upstream cloud rate limit hit (429). Backing off 5 seconds.")
                    state.uplink_status = "BACKPRESSURE"
                    time.sleep(5.0)
                    break
                else:
                    logger.warning("Upstream cloud HTTP error %d: %s", e.code, e.reason)
                    state.uplink_status = "DEGRADED"
                    time.sleep(2.0)
                    break
            except Exception as e:
                # WAN connection is down
                state.uplink_status = "OFFLINE_BUFFERING"
                logger.info("Cloud unreachable (%s). Safely buffering flows on local disk...", e)
                time.sleep(3.0)
                break

        if success_ids:
            buffer.remove(success_ids)
            # Short yield to avoid tight spinning
            time.sleep(0.1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Kairo Local Edge Sensor Aggregator")
    parser.add_argument("--upstream", default=os.getenv("KAIRO_API_URL", "https://kairo-api.onrender.com/api"), help="Kairo Cloud API base URL")
    parser.add_argument("--host", default="0.0.0.0", help="LAN interface to bind on (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=int(os.getenv("AGGREGATOR_PORT", "8080")), help="Port to listen on (default: 8080)")
    parser.add_argument("--buffer-mb", type=int, default=500, help="Max disk buffer size in MB (default: 500)")
    args = parser.parse_args()

    upstream_base = args.upstream.rstrip("/")
    buffer = AggregatorBuffer(max_size_mb=args.buffer_mb)
    state = AggregatorState()
    stop_event = threading.Event()

    # Start the WAN uplink background worker
    worker_t = threading.Thread(
        target=uplink_worker,
        args=(upstream_base, buffer, state, stop_event),
        daemon=True,
    )
    worker_t.start()

    # Start HTTP Gateway server
    handler_class = make_request_handler(upstream_base, buffer, state)
    server = ThreadedHTTPServer((args.host, args.port), handler_class)

    print("\n" + "=" * 65)
    print("  KAIRO LOCAL EDGE SENSOR AGGREGATOR (ON-PREM GATEWAY)")
    print("=" * 65)
    print(f"  LAN Listener  : http://{args.host}:{args.port}")
    print(f"  Target Cloud  : {upstream_base}")
    print(f"  Disk Buffer   : SQLite WAL (Max {args.buffer_mb} MB)")
    print(f"  Health & Stats: http://localhost:{args.port}/stats")
    print("=" * 65)
    print("  Ready. Point local sensors to this LAN address.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down aggregator gracefully...")
        stop_event.set()
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
