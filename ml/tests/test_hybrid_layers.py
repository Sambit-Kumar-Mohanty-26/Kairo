"""Unit tests for Kairo 4-Layer Hybrid Engine:
- Layer 1: Behavioral Invariants (kairo_ml.rules)
- Layer 2: Unsupervised Anomaly Baseline (kairo_ml.anomaly)
- Layer 3: ML Cascade integration (kairo_ml.infer)
- Layer 4: Threat Intelligence (kairo_ml.threat_intel)
- Master Arbiter: Priority Preemption Cascade (kairo_ml.hybrid)
"""

import numpy as np
import pytest
from kairo_ml.rules import evaluate_behavioral_invariants, batch_evaluate_invariants
from kairo_ml.threat_intel import ThreatIntelEngine
from kairo_ml.anomaly import UnsupervisedBaselineEngine
from kairo_ml.hybrid import hybrid_predict


def test_layer1_rules_volumetric_ddos():
    # Volumetric flood: flow_pkts_s > 4000
    flow = {
        "Destination Port": 80,
        "Flow Packets/s": 5000.0,
        "Fwd Packets/s": 3000.0,
        "Bwd Packets/s": 0.0,
        "Bwd Packet Length Max": 0.0,
        "Flow Duration": 1000.0,
    }
    verdict = evaluate_behavioral_invariants(flow)
    assert verdict is not None
    assert verdict["attack"] == "DDoS"
    assert verdict["rule"] == "INVARIANT_VOLUMETRIC_FLOOD"


def test_layer1_rules_port_scan():
    # Scan: unreplied non-standard port with tiny payload
    flow = {
        "Destination Port": 4444,
        "Bwd Packets/s": 0.0,
        "Bwd Packet Length Max": 0.0,
        "Init_Win_bytes_forward": 1024,
        "Init_Win_bytes_backward": 0,
        "Flow Duration": 50_000,
        "Fwd Packet Length Max": 32,
    }
    verdict = evaluate_behavioral_invariants(flow)
    assert verdict is not None
    assert verdict["attack"] == "Port Scan"
    assert verdict["rule"] == "INVARIANT_PORT_SWEEP_UNACKED"


def test_layer1_rules_brute_force():
    # Brute force: Auth port (SSH:22) burst
    flow = {
        "Destination Port": 22,
        "Flow Duration": 400_000, # 0.4s
        "Bwd Packet Length Max": 100,
        "Fwd Packet Length Max": 150,
    }
    verdict = evaluate_behavioral_invariants(flow)
    assert verdict is not None
    assert verdict["attack"] == "Brute Force"
    assert verdict["rule"] == "INVARIANT_AUTH_PORT_BURST"


def test_layer1_rules_normal_flow_returns_none():
    # Normal web flow with balanced traffic
    flow = {
        "Destination Port": 443,
        "Flow Packets/s": 15.0,
        "Fwd Packets/s": 8.0,
        "Bwd Packets/s": 7.0,
        "Bwd Packet Length Max": 1460,
        "Fwd Packet Length Max": 512,
        "Flow Duration": 2_500_000,
        "Init_Win_bytes_forward": 65535,
        "Init_Win_bytes_backward": 65535,
    }
    verdict = evaluate_behavioral_invariants(flow)
    assert verdict is None


def test_layer4_threat_intel_exact_ip():
    intel = ThreatIntelEngine(bad_ips={"198.51.100.25"})
    assert intel.check_ip("198.51.100.25") is not None
    assert intel.check_ip("198.51.100.25")["attack"] == "Botnet"
    assert intel.check_ip("8.8.8.8") is None


def test_layer4_threat_intel_subnet():
    intel = ThreatIntelEngine()
    # 198.51.100.0/24 is in KNOWN_MALICIOUS_SUBNETS
    hit = intel.check_ip("198.51.100.99")
    assert hit is not None
    assert hit["attack"] == "Botnet"
    assert hit["rule"] == "THREAT_INTEL_MALICIOUS_SUBNET"


def test_layer2_unsupervised_baseline():
    engine = UnsupervisedBaselineEngine(contamination=0.05, random_state=42)
    # Generate 200 normal training flows centered around 10
    rng = np.random.RandomState(42)
    X_normal = rng.normal(loc=10.0, scale=1.0, size=(200, 30))
    engine.fit_baseline(X_normal)
    assert engine.is_calibrated

    # Score normal points: should have low anomaly probability
    scores_normal = engine.score_flows(rng.normal(loc=10.0, scale=1.0, size=(10, 30)))
    assert np.mean(scores_normal) < 0.60

    # Score extreme outliers: should have high anomaly probability
    X_outliers = rng.normal(loc=100.0, scale=5.0, size=(10, 30))
    scores_outliers = engine.score_flows(X_outliers)
    assert np.mean(scores_outliers) > 0.80


def test_hybrid_priority_preemption_cascade():
    # Threat Intel should override rules and ML
    flows = [
        {
            "source_ip": "198.51.100.25", # Layer 4 IP hit
            "Destination Port": 80,
            "Flow Packets/s": 5000.0, # Layer 1 rule hit
            "Fwd Packets/s": 3000.0,
            "Bwd Packets/s": 0.0,
            "Bwd Packet Length Max": 0.0,
        }
    ]
    dummy_art = {
        "features": ["Destination Port", "Flow Packets/s", "Fwd Packets/s", "Bwd Packets/s", "Bwd Packet Length Max"],
        "classes": ["Normal", "DDoS", "Port Scan", "Brute Force"],
        "metrics": {"tag": "test-mock"},
        "_mean": np.zeros(5, dtype=np.float32),
        "_scale": np.ones(5, dtype=np.float32),
        "_gate_booster": None,
        "_namer_booster": None,
        "model": None,
    }
    verdicts = hybrid_predict(flows, model_art=dummy_art)
    assert len(verdicts) == 1
    assert verdicts[0]["layer"] == "Layer 4 (Threat Intelligence)"
