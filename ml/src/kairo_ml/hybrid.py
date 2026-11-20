"""Master Hybrid Engine: 4-Layer Defense-in-Depth Intrusion Detection.

Combines Google-grade detection pillars:
- Layer 1: Deterministic Behavioral Invariants (Zero-shot physical rules)
- Layer 2: Unsupervised Local Baseline & Outlier Engine
- Layer 3: Universal Multi-Cloud Pre-Trained Cascade ML
- Layer 4: Global Threat Intelligence & IP Reputation Feed

Consensus Arbiter blends evidence and delivers hardened, scale-free verdicts.
"""

from __future__ import annotations

from typing import Any, Mapping
import numpy as np

from .config import risk_of
from .infer import load, severity_of
from .rules import evaluate_behavioral_invariants
from .threat_intel import threat_intel
from .anomaly import baseline_engine


def hybrid_predict(
    flows: list[Mapping[str, Any]],
    model_art: dict | None = None,
    site_calibrated: bool = False,
) -> list[dict[str, Any]]:
    """Execute 4-layer hybrid prediction across incoming flows."""
    if not flows:
        return []

    art = model_art if model_art is not None else load()
    features = art["features"]
    classes = art["classes"]
    tag = art["metrics"]["tag"]

    # Pre-extract numerical matrix
    x_matrix = np.asarray([[float(f.get(c, 0.0)) for c in features] for f in flows], dtype=np.float32)
    x_matrix = np.nan_to_num(x_matrix, nan=0.0, posinf=1e6, neginf=-1e6)

    mean = art["_mean"]
    scale = art["_scale"]
    x_scaled = (x_matrix - mean) / scale

    # 1. Base ML predictions
    gate_b = art.get("_gate_booster")
    namer_b = art.get("_namer_booster")
    model_obj = art.get("model")

    if gate_b is not None and namer_b is not None:
        p_gate = gate_b.inplace_predict(x_scaled)
        p_attack = p_gate[:, 1] if p_gate.ndim == 2 else p_gate
        gate_thresh = float(art.get("_cascade_thresh", 0.5))
        passed = p_attack > gate_thresh

        p_namer = np.zeros((len(flows), len(classes)), dtype=np.float32)
        p_namer[:, 0] = 1.0 - p_attack
        if np.any(passed):
            attacks_p = namer_b.inplace_predict(x_scaled[passed])
            p_namer[passed, 1:] = attacks_p
            p_namer[passed, 0] = 0.0

        ml_pred_idx = np.argmax(p_namer, axis=1)
        ml_conf = np.max(p_namer, axis=1)
    elif model_obj is not None:
        ml_pred_idx = model_obj.predict(x_matrix)
        ml_conf = np.ones(len(flows), dtype=np.float32) * 0.95
    else:
        ml_pred_idx = np.zeros(len(flows), dtype=int)
        ml_conf = np.ones(len(flows), dtype=np.float32) * 0.99

    # 2. Layer 2: Unsupervised anomaly scores
    anomaly_scores = baseline_engine.score_flows(x_matrix)

    # 3. Arbitrate Layer 1 (Invariants), Layer 4 (Threat Intel), Layer 3 (ML), Layer 2 (Anomaly)
    results = []
    for i, f in enumerate(flows):
        src_ip = str(f.get("source_ip", f.get("IPV4_SRC_ADDR", "")))
        dst_ip = str(f.get("target_ip", f.get("IPV4_DST_ADDR", "")))

        # Layer 4: Threat Intelligence
        intel_hit = threat_intel.check_ip(src_ip) or threat_intel.check_ip(dst_ip)
        if intel_hit:
            attack = intel_hit["attack"]
            confidence = intel_hit["confidence"]
            layer = "Layer 4 (Threat Intelligence)"
            evidence = intel_hit["evidence"]
        else:
            # Layer 1: Behavioral Invariant Rules
            rule_hit = evaluate_behavioral_invariants(f)
            if rule_hit:
                attack = rule_hit["attack"]
                confidence = rule_hit["confidence"]
                layer = "Layer 1 (Behavioral Invariant)"
                evidence = rule_hit["evidence"]
            else:
                # Layer 3: Machine Learning Model
                attack = classes[int(ml_pred_idx[i])]
                confidence = float(ml_conf[i])
                layer = "Layer 3 (Pretrained ML Cascade)"
                evidence = {"ml_confidence": round(confidence, 4)}

                # Layer 2: If ML says Normal, check if it's an extreme zero-day anomaly
                if attack == "Normal" and anomaly_scores[i] > 0.85:
                    attack = "Anomaly"
                    confidence = float(anomaly_scores[i])
                    layer = "Layer 2 (Unsupervised Baseline Anomaly)"
                    evidence = {"anomaly_score": round(confidence, 4)}

        risk = risk_of(attack, float(confidence))
        severity = severity_of(risk)

        results.append({
            "attack": attack,
            "confidence": round(float(confidence), 4),
            "risk": risk,
            "severity": severity,
            "layer": layer,
            "evidence": evidence,
            "model": f"{tag}:hybrid-4layer",
        })

    return results
