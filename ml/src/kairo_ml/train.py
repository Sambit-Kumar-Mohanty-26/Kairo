"""Train the ensemble and write the artifact the service loads.

Weighted soft voting over three tree models — the same 40/35/25 split the
console's Model tab draws. Soft rather than hard because the product needs a
confidence, not just a class: a 51% DDoS and a 99% DDoS are different
incidents and the operator has to be able to tell.

    python -m kairo_ml.train              # real CICIDS2017 in data/raw/
    python -m kairo_ml.train --synthetic  # dev set, runs in under a minute
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import date

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier, VotingClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from .config import ARTIFACTS, CLASSES, METRICS_PATH, MODEL_PATH
from .data import load_raw, synthetic

#: Must match ENSEMBLE in frontend/src/lib/demo.ts.
WEIGHTS = {"Random Forest": 0.40, "XGBoost": 0.35, "Extra Trees": 0.25}


def build(seed: int = 42) -> Pipeline:
    """Scaler then vote.

    Trees do not need scaling, but the scaler is fitted on the training split
    only and travels inside the artifact — which is what stops the service
    from having to reimplement preprocessing and drift away from training.
    """
    rf = RandomForestClassifier(
        n_estimators=300, criterion="gini", n_jobs=-1, class_weight="balanced", random_state=seed
    )
    xgb = XGBClassifier(
        n_estimators=400,
        max_depth=8,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        tree_method="hist",
        n_jobs=-1,
        random_state=seed,
    )
    et = ExtraTreesClassifier(
        n_estimators=300, criterion="entropy", n_jobs=-1, class_weight="balanced", random_state=seed
    )
    vote = VotingClassifier(
        estimators=[("Random Forest", rf), ("XGBoost", xgb), ("Extra Trees", et)],
        voting="soft",
        weights=[WEIGHTS["Random Forest"], WEIGHTS["XGBoost"], WEIGHTS["Extra Trees"]],
        n_jobs=None,  # the members already use every core
    )
    return Pipeline([("scale", StandardScaler()), ("vote", vote)])


def train(df: pd.DataFrame, *, tag: str, dataset: str, seed: int = 42) -> dict:
    """Fit on a stratified split and return metrics in the console's shape."""
    features = [c for c in df.columns if c != "y"]
    present = [c for c in CLASSES if c in set(df["y"])]
    codes = {c: i for i, c in enumerate(present)}

    X = df[features].to_numpy(dtype=np.float32)
    y = df["y"].map(codes).to_numpy()

    # Stratified: Botnet is under 2,000 rows in CICIDS2017 and a random split
    # can leave the test set with almost none of it.
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)

    model = build(seed)
    t0 = time.time()
    model.fit(X_tr, y_tr)
    took = time.time() - t0

    pred = model.predict(X_te)
    report = classification_report(y_te, pred, target_names=present, output_dict=True, zero_division=0)

    metrics = {
        "tag": tag,
        "trainedAt": date.today().isoformat(),
        "dataset": dataset,
        "accuracy": round(float(accuracy_score(y_te, pred)), 4),
        "macroF1": round(float(f1_score(y_te, pred, average="macro")), 4),
        "trainSeconds": round(took, 1),
        "classes": [
            {
                "cls": c,
                "precision": round(report[c]["precision"], 4),
                "recall": round(report[c]["recall"], 4),
                "f1": round(report[c]["f1-score"], 4),
                "support": int(report[c]["support"]),
            }
            for c in present
        ],
    }

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": features, "classes": present, "metrics": metrics}, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return metrics


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--synthetic", action="store_true", help="train on the generated dev set")
    ap.add_argument("--tag", default=None)
    ap.add_argument("--per-class", type=int, default=60_000)
    args = ap.parse_args()

    if args.synthetic:
        df = synthetic()
        # The tag carries the provenance so a synthetic model can never be
        # mistaken for a trained one downstream — the service prints it.
        tag = args.tag or "v0-synthetic"
        dataset = f"synthetic dev set · {len(df):,} flows"
    else:
        df = load_raw(per_class=args.per_class)
        tag = args.tag or "v1.0"
        dataset = f"CICIDS2017 · {len(df):,} flows"

    m = train(df, tag=tag, dataset=dataset)
    print(json.dumps(m, indent=2))
    print(f"\nwrote {MODEL_PATH}")


if __name__ == "__main__":
    main()
