"""Tests for Kairo Continuous Site-Specific Tenant Adaptation Engine."""

import pytest
from kairo_ml.adapt import TenantAdapter, TenantAdapterRegistry


def test_tenant_adapter_basic_fit_and_risk_reduction():
    adapter = TenantAdapter(alpha=0.6)

    # Enterprise backup traffic with high duration and high bytes_in (often flagged as DoS/Exfiltration)
    fp_cluster = [
        {"duration": 120.0 + i, "bytes_in": 5000000 + i * 1000, "packets_in": 3000, "dest_port": 8443}
        for i in range(15)
    ]
    # True malicious SYN flood traffic
    tp_cluster = [
        {"duration": 0.5, "bytes_in": 1200, "packets_in": 1500, "dest_port": 80}
        for i in range(15)
    ]

    samples = fp_cluster + tp_cluster
    labels = [0] * len(fp_cluster) + [1] * len(tp_cluster)

    metrics = adapter.fit(samples, labels, max_iter=200, lr=0.1)

    assert metrics["samples"] == 30
    assert metrics["false_positives"] == 15
    assert metrics["true_positives"] == 15
    assert metrics["accuracy"] >= 0.90
    assert metrics["version"] == 2

    # Test risk calibration on unseen false-positive test sample from the same backup cluster
    test_fp_flow = {"duration": 125.0, "bytes_in": 5050000, "packets_in": 3100, "dest_port": 8443}
    base_risk = 85  # Previously flagged as critical/warning

    calibrated_risk = adapter.adjust_risk(base_risk, test_fp_flow)

    # The adapter should recognize the tenant's benign pattern and drop risk significantly
    assert calibrated_risk < base_risk, f"Expected risk reduction, got {calibrated_risk} >= {base_risk}"
    assert calibrated_risk <= 60, f"Expected calibrated risk <= 60, got {calibrated_risk}"

    # Test risk calibration on unseen true attack
    test_attack_flow = {"duration": 0.4, "bytes_in": 1100, "packets_in": 1600, "dest_port": 80}
    base_attack_risk = 88
    calibrated_attack_risk = adapter.adjust_risk(base_attack_risk, test_attack_flow)
    assert calibrated_attack_risk >= base_attack_risk, "True attack risk should remain high or increase"


def test_tenant_adapter_json_serialization():
    adapter = TenantAdapter(
        weights={"duration": -0.85, "bytes_in": -1.2},
        bias=-0.3,
        alpha=0.5,
        feature_means={"duration": 100.0, "bytes_in": 4000.0},
        feature_stds={"duration": 10.0, "bytes_in": 500.0},
        version=3,
    )

    json_str = adapter.to_json()
    assert '"version": 3' in json_str

    restored = TenantAdapter.from_json(json_str)
    assert restored.version == 3
    assert restored.bias == -0.3
    assert restored.alpha == 0.5
    assert restored.weights["duration"] == -0.85
    assert restored.feature_means["bytes_in"] == 4000.0


def test_tenant_adapter_registry():
    reg = TenantAdapterRegistry()
    org_id = "tenant-enterprise-bank-123"

    assert reg.get(org_id) is None

    adapter = TenantAdapter(weights={"dest_port": 0.5})
    reg.set(org_id, adapter)

    retrieved = reg.get(org_id)
    assert retrieved is not None
    assert retrieved.weights["dest_port"] == 0.5

    reg.clear()
    assert reg.get(org_id) is None
