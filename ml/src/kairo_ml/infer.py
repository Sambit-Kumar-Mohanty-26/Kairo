"""Turn a flow into a verdict.

The artifact carries its own scaler and feature order, so nothing here
reimplements preprocessing — the single most common way a served model quietly
stops matching the one that was trained.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Mapping

import numpy as np

from .config import MODEL_PATH, risk_of

#: Same thresholds the console uses to colour a row.
CRITICAL_AT = 88
WARNING_AT = 70


@lru_cache(maxsize=1)
def load() -> dict:
    """Load the artifact once per process."""
    import joblib

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"No model at {MODEL_PATH}. Run: python -m kairo_ml.train --synthetic"
        )
    return joblib.load(MODEL_PATH)


def severity_of(risk: int) -> str:
    return "critical" if risk >= CRITICAL_AT else "warning" if risk >= WARNING_AT else "normal"


def _matrix(flows: list[Mapping[str, Any]], features: list[str]) -> np.ndarray:
    """Order the columns and reject an incomplete flow.

    A missing feature silently defaulted to zero is a wrong verdict delivered
    with full confidence, so this is a hard error rather than a fill.
    """
    missing = sorted({f for f in features if f not in flows[0]})
    if missing:
        raise ValueError(f"flow is missing {len(missing)} feature(s): {', '.join(missing[:6])}")
    return np.asarray([[float(f[c]) for c in features] for f in flows], dtype=np.float32)


def _evidence(x: np.ndarray, artifact: dict, k: int = 5) -> list[dict]:
    """The features this flow is most unusual on, weighted by how much the
    model leans on them overall.

    Not SHAP. It is a z-score against the training distribution (the scaler is
    already fitted, so this is free) times the ensemble's global importance —
    enough to answer "why" in the detail pane without a second dependency and
    a hundred times the inference cost.
    """
    model = artifact["model"]
    scaler = model.named_steps["scale"]
    z = np.abs((x - scaler.mean_) / np.sqrt(scaler.var_ + 1e-12))

    # The last step is whatever won the benchmark: an ensemble with members,
    # or a single tree model. Both expose importance, just not in one place.
    final = model.steps[-1][1]
    members = getattr(final, "estimators_", None)
    gi = np.zeros(x.shape[1], dtype=np.float64)
    total = 0.0
    if members:
        weights = getattr(final, "weights", None) or [1.0] * len(members)
        for est, w in zip(members, weights):
            fi = getattr(est, "feature_importances_", None)
            if fi is not None:
                gi += np.asarray(fi, dtype=np.float64) * w
                total += w
    else:
        fi = getattr(final, "feature_importances_", None)
        if fi is not None:
            gi, total = np.asarray(fi, dtype=np.float64), 1.0
    gi = gi / total if total else np.full(x.shape[1], 1 / x.shape[1])

    score = z * gi
    order = np.argsort(-score, axis=1)[:, :k]
    names = artifact["features"]
    out = []
    for row, idx in zip(score, order):
        s = row[idx].sum() or 1.0
        out.append([{"name": names[i], "weight": round(float(row[i] / s), 3)} for i in idx])
    return out


def predict(flows: list[Mapping[str, Any]]) -> list[dict]:
    """Classify flows. One dict per flow, in the console's Detection shape."""
    if not flows:
        return []
    art = load()
    x = _matrix(flows, art["features"])
    proba = art["model"].predict_proba(x)
    evidence = _evidence(x, art)

    out = []
    for p, ev in zip(proba, evidence):
        i = int(np.argmax(p))
        cls = art["classes"][i]
        conf = float(p[i])
        risk = risk_of(cls, conf)
        out.append(
            {
                "attack": cls,
                "confidence": round(conf, 4),
                "risk": risk,
                "severity": severity_of(risk),
                "features": ev,
                "model": art["metrics"]["tag"],
            }
        )
    return out


def predict_one(flow: Mapping[str, Any]) -> dict:
    return predict([flow])[0]
