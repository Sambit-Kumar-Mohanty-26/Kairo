"""Feature selection: variance floor, correlation pruning, mutual information.

The three stages the landing page names, in that order, for the reason it
gives: a feature that barely moves cannot separate anything; two features
saying the same thing earn one seat; and of what remains, keep the ones that
actually tell us about the label.

Order matters. Correlation is the expensive stage and mutual information the
most expensive, so each one runs on a smaller set than the last.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.feature_selection import mutual_info_classif
from sklearn.preprocessing import MinMaxScaler

#: Variance below this, after squashing each column to [0, 1], is a feature
#: that is effectively constant. Raw variance cannot be thresholded across
#: columns whose units differ by ten orders of magnitude.
VAR_FLOOR = 1e-4

#: Above this absolute Pearson correlation, two columns are the same column.
#: CICIDS2017 is full of these by construction — Average Packet Size and
#: Packet Length Mean, Subflow Fwd Bytes and Total Length of Fwd Packets.
CORR_MAX = 0.95

#: Mutual information is estimated on a subsample; it is a k-NN estimator and
#: 2.8M rows buys no accuracy over 120k, at roughly twenty times the cost.
MI_SAMPLE = 120_000


def select(X: pd.DataFrame, y: pd.Series, *, k: int = 30, seed: int = 42) -> tuple[list[str], dict]:
    """Return the surviving feature names and a trace of every cull.

    The trace is not decoration: it is what the research section renders, so
    the shape of the cull shown there is the shape that actually happened.
    """
    trace: dict = {"started": len(X.columns), "stages": []}
    cols = list(X.columns)

    # ---- 1. variance floor ------------------------------------------------
    scaled = MinMaxScaler().fit_transform(X[cols].to_numpy(dtype=np.float64))
    var = np.nan_to_num(scaled.var(axis=0))
    keep = [c for c, v in zip(cols, var) if v > VAR_FLOOR]
    trace["stages"].append(
        {
            "name": "Variance floor",
            "dropped": sorted(set(cols) - set(keep)),
            "kept": len(keep),
        }
    )
    cols = keep

    # ---- 2. correlation pruning -------------------------------------------
    corr = X[cols].corr(method="pearson").abs().to_numpy()
    np.fill_diagonal(corr, 0.0)
    dropped: set[str] = set()
    for i, ci in enumerate(cols):
        if ci in dropped:
            continue
        for j in range(i + 1, len(cols)):
            if cols[j] not in dropped and corr[i, j] > CORR_MAX:
                # keep the earlier column; pairs this tight are interchangeable
                dropped.add(cols[j])
    keep = [c for c in cols if c not in dropped]
    trace["stages"].append(
        {"name": "Correlation pruning", "dropped": sorted(dropped), "kept": len(keep)}
    )
    cols = keep

    # ---- 3. mutual information --------------------------------------------
    rng = np.random.default_rng(seed)
    n = min(MI_SAMPLE, len(X))
    idx = rng.choice(len(X), size=n, replace=False)
    mi = mutual_info_classif(
        X[cols].to_numpy(dtype=np.float32)[idx],
        np.asarray(y)[idx],
        discrete_features=False,
        random_state=seed,
    )
    ranked = sorted(zip(cols, mi), key=lambda t: -t[1])
    keep = [c for c, _ in ranked[:k]]
    trace["stages"].append(
        {
            "name": "Mutual information",
            "dropped": sorted(c for c, _ in ranked[k:]),
            "kept": len(keep),
            "scores": {c: round(float(s), 4) for c, s in ranked},
        }
    )

    trace["selected"] = keep
    return keep, trace


def tells(X: pd.DataFrame, y: pd.Series, *, top: int = 3, seed: int = 42) -> dict:
    """Per class, the features that give *that* class away.

    `select` ranks features for the seven-way problem, which says nothing
    about which column betrays a botnet. This is the same estimator run
    one-vs-rest, and it is where the per-class chips in section 03 come from.
    Naming a feature the model does not lean on for that class is a claim we
    cannot check, so we measure it.

    Two rankings fall out of the same matrix and they answer different
    questions. `top` is raw one-vs-rest information, and it is dominated by
    the few columns that carry most of the signal for everything — every
    class lists Packet Length Mean, which is true and useless on a card.
    `distinctive` divides by the mean across classes first, so it names the
    features that say more about this class than about the rest. That is what
    a tell is.
    """
    rng = np.random.default_rng(seed)
    n = min(MI_SAMPLE, len(X))
    idx = rng.choice(len(X), size=n, replace=False)
    Xs = X.to_numpy(dtype=np.float32)[idx]
    ys = np.asarray(y)[idx]

    cols = list(X.columns)
    mi = {
        str(cls): mutual_info_classif(
            Xs, (ys == cls).astype(int), discrete_features=False, random_state=seed
        )
        for cls in pd.unique(ys)
    }
    across = np.mean(list(mi.values()), axis=0) + 1e-12

    def pick(scores):
        return [c for c, _ in sorted(zip(cols, scores), key=lambda t: -t[1])[:top]]

    return {
        "top": {k: pick(v) for k, v in mi.items()},
        "distinctive": {k: pick(v / across) for k, v in mi.items()},
        "mi": {k: {c: round(float(s), 4) for c, s in zip(cols, v)} for k, v in mi.items()},
    }


if __name__ == "__main__":
    import json

    from .config import ARTIFACTS
    from .data import load_raw

    feats = json.loads((ARTIFACTS / "benchmark.json").read_text(encoding="utf-8"))["features"]
    df = load_raw()
    out = tells(df[feats], df["y"])
    (ARTIFACTS / "tells.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    for cls, names in out["distinctive"].items():
        print(f"{cls:<12} {', '.join(names)}")
