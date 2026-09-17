"""Fill section 03's table: seven models, six honest columns.

    python -m kairo_ml.benchmark [--per-class 60000] [--features 30]

Writes artifacts/benchmark.json (the table), artifacts/selection.json (what
the cull actually dropped) and the deployed artifact for the winning
ensemble. Nothing here is copied from a paper; every cell is measured on the
same split, so the rows are comparable to each other, which is the only
thing that makes a comparison table worth printing.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import date

import joblib
import numpy as np
from sklearn.ensemble import (
    ExtraTreesClassifier,
    RandomForestClassifier,
    StackingClassifier,
    VotingClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier

from .config import ARTIFACTS, CLASSES, METRICS_PATH, MODEL_PATH
from .data import load_raw
from .selection import select
from .train import WEIGHTS

#: An RBF SVM is quadratic in the training set. On a quarter of a million
#: flows it does not finish; on a stratified 60k subsample it does, and the
#: row is labelled with the sample size rather than compared as an equal.
SVM_CAP = 60_000


def _members(seed: int) -> dict:
    return {
        "Decision Tree": DecisionTreeClassifier(class_weight="balanced", random_state=seed),
        "Random Forest": RandomForestClassifier(
            n_estimators=300, n_jobs=-1, class_weight="balanced", random_state=seed
        ),
        "Extra Trees": ExtraTreesClassifier(
            n_estimators=300,
            criterion="entropy",
            n_jobs=-1,
            class_weight="balanced",
            random_state=seed,
        ),
        "SVM": SVC(kernel="rbf", C=10.0, gamma="scale", class_weight="balanced", random_state=seed),
        "XGBoost": XGBClassifier(
            n_estimators=400,
            max_depth=8,
            learning_rate=0.1,
            subsample=0.9,
            colsample_bytree=0.9,
            tree_method="hist",
            n_jobs=-1,
            random_state=seed,
        ),
    }


def score(y_true, y_pred, names: list[str]) -> dict:
    """Accuracy, macro-F1, macro precision/recall, and macro FPR/FNR.

    FPR and FNR are one-vs-rest per class then averaged, which is the only
    definition that means anything across seven classes. They are reported
    because accuracy on a capture that is mostly benign is not evidence.
    """
    rep = classification_report(
        y_true, y_pred, target_names=names, output_dict=True, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=range(len(names)))
    fp = cm.sum(axis=0) - np.diag(cm)
    fn = cm.sum(axis=1) - np.diag(cm)
    tp = np.diag(cm)
    tn = cm.sum() - (fp + fn + tp)
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "macroF1": round(float(f1_score(y_true, y_pred, average="macro")), 4),
        "precision": round(float(rep["macro avg"]["precision"]), 4),
        "recall": round(float(rep["macro avg"]["recall"]), 4),
        "fpr": round(float(np.mean(fp / np.maximum(fp + tn, 1))), 4),
        "fnr": round(float(np.mean(fn / np.maximum(fn + tp, 1))), 4),
        "perClass": [
            {
                "cls": c,
                "precision": round(rep[c]["precision"], 4),
                "recall": round(rep[c]["recall"], 4),
                "f1": round(rep[c]["f1-score"], 4),
                "support": int(rep[c]["support"]),
            }
            for c in names
        ],
    }


def run(per_class: int = 60_000, k: int = 30, seed: int = 42) -> dict:
    df = load_raw(per_class=per_class)
    features_all = [c for c in df.columns if c != "y"]
    present = [c for c in CLASSES if c in set(df["y"])]
    codes = {c: i for i, c in enumerate(present)}
    y_all = df["y"].map(codes)

    print(f"loaded {len(df):,} flows, {len(features_all)} features")
    for c in present:
        print(f"  {c:<12} {int((df['y'] == c).sum()):>8,}")

    t0 = time.time()
    features, trace = select(df[features_all], y_all, k=k, seed=seed)
    print(f"selection: {trace['started']} -> {len(features)} in {time.time() - t0:.0f}s")
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "selection.json").write_text(json.dumps(trace, indent=2), encoding="utf-8")

    X = df[features].to_numpy(dtype=np.float32)
    y = y_all.to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)

    rows, fitted = [], {}
    for name, est in _members(seed).items():
        Xt, yt, note = X_tr, y_tr, ""
        if name == "SVM" and len(X_tr) > SVM_CAP:
            Xt, _, yt, _ = train_test_split(
                X_tr, y_tr, train_size=SVM_CAP, stratify=y_tr, random_state=seed
            )
            note = f"{SVM_CAP // 1000}k subsample"
        pipe = Pipeline([("scale", StandardScaler()), ("clf", est)])
        t = time.time()
        pipe.fit(Xt, yt)
        took = time.time() - t
        m = score(y_te, pipe.predict(X_te), present)
        m |= {"name": name, "seconds": round(took, 1), "note": note, "trainRows": int(len(Xt))}
        rows.append(m)
        fitted[name] = pipe
        print(f"  {name:<20} acc {m['accuracy']:.4f}  macroF1 {m['macroF1']:.4f}  ({took:.0f}s)")

    # ---- the two ensembles -------------------------------------------------
    vote = VotingClassifier(
        estimators=[(n, _members(seed)[n]) for n in WEIGHTS],
        voting="soft",
        weights=[WEIGHTS[n] for n in WEIGHTS],
    )
    stack = StackingClassifier(
        estimators=[(n, _members(seed)[n]) for n in ("Random Forest", "Extra Trees", "XGBoost")],
        final_estimator=LogisticRegression(max_iter=1000, class_weight="balanced"),
        cv=3,
        n_jobs=None,
    )
    for name, est in (("Weighted Soft Voting", vote), ("Stacking Ensemble", stack)):
        pipe = Pipeline([("scale", StandardScaler()), ("vote", est)])
        t = time.time()
        pipe.fit(X_tr, y_tr)
        took = time.time() - t
        m = score(y_te, pipe.predict(X_te), present)
        m |= {"name": name, "seconds": round(took, 1), "note": "", "trainRows": int(len(X_tr))}
        rows.append(m)
        fitted[name] = pipe
        print(f"  {name:<20} acc {m['accuracy']:.4f}  macroF1 {m['macroF1']:.4f}  ({took:.0f}s)")

    best = max(rows, key=lambda r: r["macroF1"])
    out = {
        "trainedAt": date.today().isoformat(),
        "dataset": f"CICIDS2017 - {len(df):,} flows",
        "testRows": int(len(y_te)),
        "featureCount": len(features),
        "featuresStarted": trace["started"],
        "features": features,
        "classes": present,
        "best": best["name"],
        "models": rows,
    }
    (ARTIFACTS / "benchmark.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

    # The deployed artifact is whichever model actually won, and its metrics
    # are that model's own row. Deploying one model under another's numbers is
    # the single easiest way to ship a lie.
    win = fitted[best["name"]]
    metrics = {
        "tag": "v1.0",
        "trainedAt": out["trainedAt"],
        "dataset": out["dataset"],
        "accuracy": best["accuracy"],
        "macroF1": best["macroF1"],
        "deployed": best["name"],
        "classes": best["perClass"],
    }
    joblib.dump(
        {"model": win, "features": features, "classes": present, "metrics": metrics}, MODEL_PATH
    )
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"\nbest: {best['name']}  ->  {MODEL_PATH}")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--per-class", type=int, default=60_000)
    ap.add_argument("--features", type=int, default=30)
    a = ap.parse_args()
    run(per_class=a.per_class, k=a.features)
