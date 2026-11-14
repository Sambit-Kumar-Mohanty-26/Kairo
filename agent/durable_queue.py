"""Durable SQLite-backed queue for the Kairo sensor agent.

Persists pending flow batches to disk before network transmission.
If the sensor process crashes, restarts, or the backend is unreachable for
extended periods, all pending batches are retained and resumed safely.
Zero external dependencies (uses standard library sqlite3).
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import sqlite3
import threading
import time
from typing import Any

logger = logging.getLogger("kairo.durable_queue")

DEFAULT_DB_PATH = os.getenv("KAIRO_QUEUE_PATH", "kairo_sensor.db")
MAX_QUEUE_BYTES = int(os.getenv("KAIRO_QUEUE_MAX_BYTES", 100 * 1024 * 1024))  # 100 MB default
MAX_PENDING_BATCHES = int(os.getenv("KAIRO_QUEUE_MAX_BATCHES", 1_000))        # 1,000 batches (~100k flows)


class DurableQueue:
    """Thread-safe SQLite persistent queue for telemetry batches."""

    def __init__(
        self,
        db_path: str = DEFAULT_DB_PATH,
        max_bytes: int = MAX_QUEUE_BYTES,
        max_batches: int = MAX_PENDING_BATCHES,
    ) -> None:
        self.db_path = pathlib.Path(db_path).resolve()
        self.max_bytes = max_bytes
        self.max_batches = max_batches
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        # Enable write-ahead logging for high concurrency and resilience
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA temp_store=MEMORY;")
        return conn

    def _init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS pending_batches (
                    batch_id TEXT PRIMARY KEY,
                    created_at REAL NOT NULL,
                    flow_count INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_attempt REAL DEFAULT 0,
                    last_error TEXT DEFAULT ''
                );
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_batches_created_at
                ON pending_batches(created_at);
                """
            )
            conn.commit()

    def enqueue(self, batch_id: str, flows: list[dict[str, Any]]) -> bool:
        """Persist a batch of flows. Returns True if enqueued, False if storage capacity exceeded."""
        payload = json.dumps(flows)
        now = time.time()
        flow_count = len(flows)

        with self._lock:
            # Check capacity before insertion
            m = self._metrics_locked()
            if m["pending_batches"] >= self.max_batches or m["queue_bytes"] >= self.max_bytes:
                logger.warning(
                    f"Queue capacity reached: {m['pending_batches']} batches, {m['queue_bytes']} bytes. "
                    "Refusing new flows to prevent disk exhaustion."
                )
                return False

            with self._get_connection() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO pending_batches
                    (batch_id, created_at, flow_count, payload, attempts, last_attempt, last_error)
                    VALUES (?, ?, ?, ?, 0, 0, '')
                    """,
                    (batch_id, now, flow_count, payload),
                )
                conn.commit()
            return True

    def peek(self, limit: int = 1) -> list[tuple[str, list[dict[str, Any]], int]]:
        """Retrieve the oldest pending batches without removing them.
        Returns list of (batch_id, flows, attempts)."""
        with self._lock, self._get_connection() as conn:
            cur = conn.execute(
                """
                SELECT batch_id, payload, attempts
                FROM pending_batches
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (limit,),
            )
            rows = cur.fetchall()
            results = []
            for r in rows:
                try:
                    flows = json.loads(r["payload"])
                    results.append((r["batch_id"], flows, r["attempts"]))
                except Exception as e:
                    logger.error(f"Corrupted batch payload {r['batch_id']}: {e}")
            return results

    def acknowledge(self, batch_id: str) -> bool:
        """Durably delete batch upon verified server acknowledgement."""
        with self._lock, self._get_connection() as conn:
            cur = conn.execute("DELETE FROM pending_batches WHERE batch_id = ?", (batch_id,))
            conn.commit()
            return cur.rowcount > 0

    def record_failure(self, batch_id: str, error: str) -> None:
        """Record a failed upload attempt with backoff tracking."""
        now = time.time()
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                UPDATE pending_batches
                SET attempts = attempts + 1, last_attempt = ?, last_error = ?
                WHERE batch_id = ?
                """,
                (now, error[:255], batch_id),
            )
            conn.commit()

    def _metrics_locked(self) -> dict[str, Any]:
        queue_bytes = 0
        try:
            if self.db_path.exists():
                queue_bytes = self.db_path.stat().st_size
                wal = self.db_path.with_name(self.db_path.name + "-wal")
                if wal.exists():
                    queue_bytes += wal.stat().st_size
        except OSError:
            pass

        with self._get_connection() as conn:
            cur = conn.execute(
                """
                SELECT COUNT(*) AS total_batches,
                       COALESCE(SUM(flow_count), 0) AS total_flows,
                       COALESCE(MIN(created_at), 0) AS oldest_created
                FROM pending_batches
                """
            )
            row = cur.fetchone()
            total_batches = int(row["total_batches"])
            total_flows = int(row["total_flows"])
            oldest_created = float(row["oldest_created"])
            oldest_age = (time.time() - oldest_created) if oldest_created > 0 else 0.0

            return {
                "pending_batches": total_batches,
                "pending_flows": total_flows,
                "oldest_batch_age_s": round(oldest_age, 1),
                "queue_bytes": queue_bytes,
                "is_pressured": (
                    total_batches >= int(self.max_batches * 0.8)
                    or queue_bytes >= int(self.max_bytes * 0.8)
                ),
            }

    def metrics(self) -> dict[str, Any]:
        """Returns operational queue health metrics."""
        with self._lock:
            return self._metrics_locked()

    def purge_acknowledged(self) -> None:
        """Checkpoint and vacuum WAL if needed."""
        with self._lock, self._get_connection() as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
