"""Layer 2: Unsupervised Local Baseline & Anomaly Detection Engine.

Learns the statistical normal baseline of a specific customer network
during passive observation without requiring labeled attack samples.
Uses Isolation Forests and Quantile Deviations to detect statistical outliers.
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import IsolationForest


class UnsupervisedBaselineEngine:
    """Site-specific unsupervised anomaly baseline."""

    def __init__(self, contamination: float = 0.01, random_state: int = 42) -> None:
        self.contamination = contamination
        self.random_state = random_state
        self.model: IsolationForest | None = None
        self.is_calibrated = False

    def fit_baseline(self, X_normal: np.ndarray) -> None:
        """Calibrate on a passive sample of local network traffic (no labels needed)."""
        self.model = IsolationForest(
            n_estimators=100,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1,
        )
        self.model.fit(X_normal)
        self.is_calibrated = True

    def score_flows(self, X: np.ndarray) -> np.ndarray:
        """Score anomaly degree between 0.0 (normal) and 1.0 (extreme outlier)."""
        if not self.is_calibrated or self.model is None:
            # Uncalibrated baseline defaults to low anomaly
            return np.zeros(len(X), dtype=np.float32)

        # decision_function: lower means more abnormal
        raw_scores = self.model.decision_function(X)
        # Normalize into [0, 1] anomaly probability: score < 0 is outlier
        probs = 1.0 / (1.0 + np.exp(raw_scores * 8.0))
        return probs.astype(np.float32)


baseline_engine = UnsupervisedBaselineEngine()
