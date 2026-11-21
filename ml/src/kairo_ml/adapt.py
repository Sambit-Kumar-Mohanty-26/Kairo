"""Tenant Site-Specific Continuous Adaptation Engine (Closed-Loop Residual Adapter).

Solves the real-world covariate shift problem across enterprise deployments
(e.g., banks vs universities vs cloud environments) without shipping raw
packet data or modifying frozen base cascade weights (Zero Catastrophic Forgetting).

Learns an L2-regularized residual calibration vector on top of the base detector
using analyst triage feedback (False Positives vs Confirmed True Positives).
"""

from __future__ import annotations

import json
import math
from typing import Any, Mapping, Sequence
import numpy as np


def _sigmoid(x: float) -> float:
    # Numerically stable sigmoid
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    else:
        z = math.exp(x)
        return z / (1.0 + z)


class TenantAdapter:
    """Lightweight residual adapter for an individual organization/tenant."""

    def __init__(
        self,
        weights: dict[str, float] | None = None,
        bias: float = 0.0,
        alpha: float = 0.6,
        feature_means: dict[str, float] | None = None,
        feature_stds: dict[str, float] | None = None,
        version: int = 1,
    ):
        self.weights = weights or {}
        self.bias = bias
        self.alpha = max(0.1, min(1.0, alpha))
        self.feature_means = feature_means or {}
        self.feature_stds = feature_stds or {}
        self.version = version

    def fit(
        self,
        samples: Sequence[Mapping[str, Any]],
        labels: Sequence[int],
        l2_reg: float = 1.0,
        max_iter: int = 100,
        lr: float = 0.05,
    ) -> dict[str, Any]:
        """Fit residual weights from analyst feedback.

        labels: 0 for BENIGN (Analyst marked False Positive)
                1 for MALICIOUS (Analyst confirmed True Attack)
        """
        if not samples or len(samples) != len(labels):
            raise ValueError("Samples and labels must be non-empty and of equal length.")

        # Determine feature universe from samples
        feature_keys = sorted({k for s in samples for k in s.keys() if isinstance(s.get(k), (int, float))})
        if not feature_keys:
            raise ValueError("No numeric features found in feedback samples.")

        # Construct design matrix
        n = len(samples)
        d = len(feature_keys)
        X = np.zeros((n, d), dtype=np.float64)
        for i, s in enumerate(samples):
            for j, f in enumerate(feature_keys):
                v = s.get(f, 0.0)
                X[i, j] = float(v) if isinstance(v, (int, float)) and not math.isnan(v) else 0.0

        y = np.array(labels, dtype=np.float64)

        # Standardize features locally for stable gradient steps
        means = X.mean(axis=0)
        stds = X.std(axis=0)
        stds[stds < 1e-6] = 1.0
        X_norm = (X - means) / stds

        # Initialize or warm-start weights
        w = np.array([self.weights.get(f, 0.0) for f in feature_keys], dtype=np.float64)
        b = self.bias

        # Mini-batch / full gradient descent with L2 regularization
        for _ in range(max_iter):
            logits = X_norm @ w + b
            preds = 1.0 / (1.0 + np.exp(-np.clip(logits, -15.0, 15.0)))
            errors = preds - y

            # Gradients with L2 weight decay
            grad_w = (X_norm.T @ errors) / n + (l2_reg / n) * w
            grad_b = np.mean(errors)

            w -= lr * grad_w
            b -= lr * grad_b

        # Compute training accuracy
        final_preds = (1.0 / (1.0 + np.exp(-np.clip(X_norm @ w + b, -15.0, 15.0)))) >= 0.5
        acc = float(np.mean(final_preds == (y >= 0.5)))

        self.weights = {f: float(w[j]) for j, f in enumerate(feature_keys)}
        self.bias = float(b)
        self.feature_means = {f: float(means[j]) for j, f in enumerate(feature_keys)}
        self.feature_stds = {f: float(stds[j]) for j, f in enumerate(feature_keys)}
        self.version += 1

        fp_count = int(np.sum(y == 0))
        tp_count = int(np.sum(y == 1))

        return {
            "version": self.version,
            "samples": n,
            "false_positives": fp_count,
            "true_positives": tp_count,
            "accuracy": acc,
            "features_adapted": len(feature_keys),
        }

    def adjust_risk(self, base_risk: int, features: Mapping[str, Any]) -> int:
        """Calibrate risk score using the tenant residual adapter.

        If features match an analyst-marked False Positive cluster,
        the calibrated risk drops significantly below alert threshold.
        """
        if not self.weights:
            return base_risk

        dot = 0.0
        for f, weight in self.weights.items():
            val = features.get(f)
            if val is not None and isinstance(val, (int, float)) and not math.isnan(val):
                m = self.feature_means.get(f, 0.0)
                s = self.feature_stds.get(f, 1.0)
                norm_val = (float(val) - m) / s
                dot += weight * norm_val

        logit = dot + self.bias
        p = _sigmoid(logit)  # 0.0 (benign bias) to 1.0 (malicious bias)

        # Delta shift centered at 0.5
        # If p ~ 0 (strong false positive signal): delta is -50 * alpha
        # If p ~ 1 (strong true attack signal): delta is +50 * alpha
        delta = round(100.0 * (p - 0.5) * self.alpha)

        calibrated = int(max(0, min(100, base_risk + delta)))
        return calibrated

    def to_json(self) -> str:
        return json.dumps({
            "version": self.version,
            "alpha": self.alpha,
            "bias": self.bias,
            "weights": self.weights,
            "feature_means": self.feature_means,
            "feature_stds": self.feature_stds,
        })

    @classmethod
    def from_json(cls, json_str: str) -> TenantAdapter:
        data = json.loads(json_str)
        return cls(
            weights=data.get("weights", {}),
            bias=data.get("bias", 0.0),
            alpha=data.get("alpha", 0.6),
            feature_means=data.get("feature_means", {}),
            feature_stds=data.get("feature_stds", {}),
            version=data.get("version", 1),
        )


class TenantAdapterRegistry:
    """Thread-safe in-memory cache of tenant adapters for real-time inference."""

    def __init__(self):
        self._adapters: dict[str, TenantAdapter] = {}

    def get(self, tenant_id: str) -> TenantAdapter | None:
        return self._adapters.get(tenant_id)

    def set(self, tenant_id: str, adapter: TenantAdapter) -> None:
        self._adapters[tenant_id] = adapter

    def clear(self) -> None:
        self._adapters.clear()


# Global in-memory registry
registry = TenantAdapterRegistry()
