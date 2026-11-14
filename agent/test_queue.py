"""Unit tests for DurableQueue in agent/durable_queue.py."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add current dir to sys.path so durable_queue is importable
sys.path.insert(0, str(Path(__file__).parent))

from durable_queue import DurableQueue


class TestDurableQueue(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.q = DurableQueue(db_path=self.tmp.name, max_batches=10)

    def tearDown(self):
        try:
            os.remove(self.tmp.name)
            wal = self.tmp.name + "-wal"
            if os.path.exists(wal):
                os.remove(wal)
            shm = self.tmp.name + "-shm"
            if os.path.exists(shm):
                os.remove(shm)
        except OSError:
            pass

    def test_enqueue_and_peek(self):
        flows = [{"id": "f1", "bytes": 100}, {"id": "f2", "bytes": 200}]
        ok = self.q.enqueue("batch-1", flows)
        self.assertTrue(ok)

        batches = self.q.peek(limit=5)
        self.assertEqual(len(batches), 1)
        batch_id, fetched_flows, attempts = batches[0]
        self.assertEqual(batch_id, "batch-1")
        self.assertEqual(len(fetched_flows), 2)
        self.assertEqual(attempts, 0)

    def test_persistence_across_restart(self):
        flows = [{"id": "f1", "bytes": 500}]
        self.q.enqueue("batch-persisted", flows)

        # Reopen queue to simulate process restart
        q2 = DurableQueue(db_path=self.tmp.name)
        batches = q2.peek(limit=1)
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0][0], "batch-persisted")
        self.assertEqual(batches[0][1][0]["bytes"], 500)

    def test_acknowledge_deletes(self):
        flows = [{"id": "f1"}]
        self.q.enqueue("batch-ack", flows)
        self.assertEqual(len(self.q.peek(1)), 1)

        deleted = self.q.acknowledge("batch-ack")
        self.assertTrue(deleted)
        self.assertEqual(len(self.q.peek(1)), 0)

    def test_record_failure_increments_attempts(self):
        flows = [{"id": "f1"}]
        self.q.enqueue("batch-fail", flows)
        self.q.record_failure("batch-fail", "Connection refused")

        batches = self.q.peek(1)
        self.assertEqual(batches[0][2], 1)

    def test_capacity_limit(self):
        small_q = DurableQueue(db_path=self.tmp.name, max_batches=2)
        self.assertTrue(small_q.enqueue("b1", [{"id": "1"}]))
        self.assertTrue(small_q.enqueue("b2", [{"id": "2"}]))
        # 3rd batch exceeds limit
        self.assertFalse(small_q.enqueue("b3", [{"id": "3"}]))
        m = small_q.metrics()
        self.assertEqual(m["pending_batches"], 2)


if __name__ == "__main__":
    unittest.main()
