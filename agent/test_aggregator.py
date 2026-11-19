"""Unit test for Local Edge Aggregator Buffer and State."""

import json
import gzip
import os
import unittest
from agent.aggregator import AggregatorBuffer, AggregatorState


class TestAggregator(unittest.TestCase):

    def setUp(self):
        self.db_path = "test_buffer.db"
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
        self.buffer = AggregatorBuffer(db_path=self.db_path, max_size_mb=2)
        self.state = AggregatorState()

    def tearDown(self):
        if os.path.exists(self.db_path):
            try:
                os.remove(self.db_path)
            except OSError:
                pass

    def test_buffer_push_and_pop(self):
        dummy_payload = {
            "batch_id": "b_123",
            "flows": [{"id": f"f_{i}", "bytes": 100} for i in range(50)]
        }
        auth = "Bearer ksk_sensor_abc"

        # Push to buffer
        self.buffer.push("/ingest/flows", auth, dummy_payload)
        self.assertEqual(self.buffer.count(), 1)

        # Pop from buffer
        items = self.buffer.pop_batch(limit=10)
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item["endpoint"], "/ingest/flows")
        self.assertEqual(item["auth_header"], auth)

        # Decompress and verify payload
        decomp = json.loads(gzip.decompress(item["payload"]))
        self.assertEqual(decomp["batch_id"], "b_123")
        self.assertEqual(len(decomp["flows"]), 50)

        # Remove after successful transmission
        self.buffer.remove([item["id"]])
        self.assertEqual(self.buffer.count(), 0)

    def test_state_metrics_and_compression(self):
        # 10,000 bytes LAN in, 1,500 bytes WAN out (85% compression savings)
        self.state.record_incoming("ksk_sensor_001", flow_count=100, raw_bytes=10000)
        self.state.record_forwarded(flow_count=100, wan_bytes=1500)

        stats = self.state.get_stats(buffer_count=0)
        self.assertEqual(stats["total_flows_received"], 100)
        self.assertEqual(stats["total_flows_forwarded"], 100)
        self.assertEqual(stats["connected_sensors_count"], 1)
        self.assertEqual(stats["bandwidth_savings_pct"], 85.0)
        self.assertEqual(stats["uplink_status"], "HEALTHY")


if __name__ == "__main__":
    unittest.main()
