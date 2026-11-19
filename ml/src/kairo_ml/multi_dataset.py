"""Multi-Dataset Cross-Domain Training and Generalization Benchmark.

Evaluates three training paradigms:
1. Baseline: Single-domain training on CICIDS2017 with StandardScaler (current deploy).
2. Robust Zero-Shot: CICIDS2017 training with RobustScaler and calibrated decision threshold.
3. Multi-Dataset Fusion: Joint domain training combining CICIDS2017 + UNSW-NB15.

Produces empirical comparative metrics to guide real-world deployment across unseen networks.
"""

from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler
from xgboost import XGBClassifier

from .config import ARTIFACTS, ROOT
from .data import load_raw
from .generalize import load_unsw


def run_benchmark(per_class: int = 15_000, seed: int = 42) -> dict:
    print("\n" + "=" * 70)
    print(" KAIRO MULTI-DATASET GENERALIZATION & CROSS-DOMAIN BENCHMARK")
    print("=" * 70)

    # 1. Load Data
    print("\n[1/4] Loading datasets...")
    t0 = time.time()
    cic = load_raw(per_class=per_class, seed=seed)
    print(f"  Loaded CICIDS2017: {len(cic):,} flows ({time.time()-t0:.1f}s)")

    t0 = time.time()
    unsw = load_unsw()
    print(f"  Loaded UNSW-NB15 : {len(unsw):,} flows ({time.time()-t0:.1f}s)")

    # Identify shared feature columns
    art = joblib.load(ARTIFACTS / "model.joblib")
    shared_features = [f for f in art["features"] if f in unsw.columns]
    print(f"  Shared feature space: {len(shared_features)} / {len(art['features'])} features")

    # Common shared taxonomy: Normal, DoS, Port Scan
    shared_classes = ["Normal", "DoS", "Port Scan"]
    class_to_idx = {c: i for i, c in enumerate(shared_classes)}

    # Filter both datasets to shared classes and shared features
    cic_filtered = cic[cic["y"].isin(shared_classes)].copy()
    unsw_filtered = unsw[unsw["y"].isin(shared_classes)].copy()

    # Subsample UNSW to balanced size for fair cross-domain training
    unsw_parts = []
    for c in shared_classes:
        grp = unsw_filtered[unsw_filtered["y"] == c]
        unsw_parts.append(grp.sample(min(len(grp), per_class), random_state=seed))
    unsw_balanced = pd.concat(unsw_parts, ignore_index=True)

    print(f"  CICIDS2017 shared pool: {len(cic_filtered):,} flows")
    print(f"  UNSW-NB15  shared pool: {len(unsw_balanced):,} flows")

    # Split each dataset into 80% train and 20% held-out test
    X_cic = cic_filtered[shared_features].to_numpy(dtype=np.float32)
    y_cic = cic_filtered["y"].map(class_to_idx).to_numpy()
    X_cic_tr, X_cic_te, y_cic_tr, y_cic_te = train_test_split(
        X_cic, y_cic, test_size=0.2, stratify=y_cic, random_state=seed
    )

    X_unsw = unsw_balanced[shared_features].to_numpy(dtype=np.float32)
    y_unsw = unsw_balanced["y"].map(class_to_idx).to_numpy()
    X_unsw_tr, X_unsw_te, y_unsw_tr, y_unsw_te = train_test_split(
        X_unsw, y_unsw, test_size=0.2, stratify=y_unsw, random_state=seed
    )

    results = {
        "benchmark_timestamp": datetime.now().isoformat(),
        "shared_features": shared_features,
        "shared_classes": shared_classes,
        "experiments": {},
    }

    # Helper function to score
    def evaluate_model(clf, name: str, train_time: float) -> dict:
        pred_cic = clf.predict(X_cic_te)
        acc_cic = accuracy_score(y_cic_te, pred_cic)
        f1_cic = f1_score(y_cic_te, pred_cic, average="macro")

        pred_unsw = clf.predict(X_unsw_te)
        acc_unsw = accuracy_score(y_unsw_te, pred_unsw)
        f1_unsw = f1_score(y_unsw_te, pred_unsw, average="macro")

        # Class breakdown on UNSW (the cross-domain target)
        report_unsw = classification_report(
            y_unsw_te, pred_unsw, target_names=shared_classes, output_dict=True, zero_division=0
        )

        return {
            "name": name,
            "train_seconds": round(train_time, 2),
            "cicids2017_accuracy": round(float(acc_cic), 4),
            "cicids2017_macro_f1": round(float(f1_cic), 4),
            "unsw_nb15_accuracy": round(float(acc_unsw), 4),
            "unsw_nb15_macro_f1": round(float(f1_unsw), 4),
            "cross_domain_harmonic_f1": round(float(2 * f1_cic * f1_unsw / max(f1_cic + f1_unsw, 1e-12)), 4),
            "unsw_class_breakdown": {
                c: {
                    "precision": round(report_unsw[c]["precision"], 4),
                    "recall": round(report_unsw[c]["recall"], 4),
                    "f1": round(report_unsw[c]["f1-score"], 4),
                    "support": int(report_unsw[c]["support"]),
                }
                for c in shared_classes
            },
        }

    # =========================================================================
    # Experiment 1: Single-Domain Baseline (CICIDS2017 + StandardScaler)
    # =========================================================================
    print("\n[2/4] Training Model A: Single-Domain Baseline (CICIDS2017 only)...")
    pipe_a = Pipeline([
        ("scale", StandardScaler()),
        ("xgb", XGBClassifier(n_estimators=180, max_depth=6, learning_rate=0.1, tree_method="hist", n_jobs=-1, random_state=seed)),
    ])
    t_start = time.time()
    pipe_a.fit(X_cic_tr, y_cic_tr)
    took_a = time.time() - t_start
    res_a = evaluate_model(pipe_a, "Model A: Single-Domain Baseline (CICIDS2017 only)", took_a)
    results["experiments"]["model_a_baseline"] = res_a
    print(f"  -> CICIDS2017 Macro-F1: {res_a['cicids2017_macro_f1']:.4f} | UNSW-NB15 Macro-F1: {res_a['unsw_nb15_macro_f1']:.4f} (took {took_a:.1f}s)")

    # =========================================================================
    # Experiment 2: Robust Zero-Shot (CICIDS2017 + RobustScaler)
    # =========================================================================
    print("\n[3/4] Training Model B: Zero-Shot Robust Normalization (RobustScaler)...")
    pipe_b = Pipeline([
        ("scale", RobustScaler()),
        ("xgb", XGBClassifier(n_estimators=180, max_depth=6, learning_rate=0.1, tree_method="hist", n_jobs=-1, random_state=seed)),
    ])
    t_start = time.time()
    pipe_b.fit(X_cic_tr, y_cic_tr)
    took_b = time.time() - t_start
    res_b = evaluate_model(pipe_b, "Model B: Robust Outlier Scaling (RobustScaler)", took_b)
    results["experiments"]["model_b_robust_scaler"] = res_b
    print(f"  -> CICIDS2017 Macro-F1: {res_b['cicids2017_macro_f1']:.4f} | UNSW-NB15 Macro-F1: {res_b['unsw_nb15_macro_f1']:.4f} (took {took_b:.1f}s)")

    # =========================================================================
    # Experiment 3: Joint Multi-Dataset Fusion (CICIDS2017 + UNSW-NB15 pooled)
    # =========================================================================
    print("\n[4/5] Training Model C: Joint Multi-Dataset Domain Fusion (CICIDS2017 + UNSW-NB15)...")
    X_joint_tr = np.vstack([X_cic_tr, X_unsw_tr])
    y_joint_tr = np.concatenate([y_cic_tr, y_unsw_tr])

    pipe_c = Pipeline([
        ("scale", RobustScaler()),
        ("xgb", XGBClassifier(n_estimators=220, max_depth=7, learning_rate=0.1, tree_method="hist", n_jobs=-1, random_state=seed)),
    ])
    t_start = time.time()
    pipe_c.fit(X_joint_tr, y_joint_tr)
    took_c = time.time() - t_start
    res_c = evaluate_model(pipe_c, "Model C: Multi-Dataset Domain Fusion (CIC + UNSW)", took_c)
    results["experiments"]["model_c_multi_dataset"] = res_c
    print(f"  -> CICIDS2017 Macro-F1: {res_c['cicids2017_macro_f1']:.4f} | UNSW-NB15 Macro-F1: {res_c['unsw_nb15_macro_f1']:.4f} (took {took_c:.1f}s)")

    # =========================================================================
    # Experiment 4: Multi-Dataset Fusion + Feature Debiasing (Drop OS Window Artifacts)
    # =========================================================================
    print("\n[5/5] Training Model D: Multi-Dataset Fusion + OS Feature Debiasing...")
    debiased_cols = [f for f in shared_features if f not in ("Init_Win_bytes_forward", "Init_Win_bytes_backward")]
    debiased_indices = [shared_features.index(f) for f in debiased_cols]

    X_joint_tr_deb = X_joint_tr[:, debiased_indices]
    X_cic_te_deb = X_cic_te[:, debiased_indices]
    X_unsw_te_deb = X_unsw_te[:, debiased_indices]

    pipe_d = Pipeline([
        ("scale", RobustScaler()),
        ("xgb", XGBClassifier(n_estimators=260, max_depth=8, learning_rate=0.08, subsample=0.9, colsample_bytree=0.9, tree_method="hist", n_jobs=-1, random_state=seed)),
    ])
    t_start = time.time()
    pipe_d.fit(X_joint_tr_deb, y_joint_tr)
    took_d = time.time() - t_start

    # Evaluate Model D on debiased subsets
    pred_cic_d = pipe_d.predict(X_cic_te_deb)
    acc_cic_d = accuracy_score(y_cic_te, pred_cic_d)
    f1_cic_d = f1_score(y_cic_te, pred_cic_d, average="macro")

    pred_unsw_d = pipe_d.predict(X_unsw_te_deb)
    acc_unsw_d = accuracy_score(y_unsw_te, pred_unsw_d)
    f1_unsw_d = f1_score(y_unsw_te, pred_unsw_d, average="macro")
    rep_unsw_d = classification_report(y_unsw_te, pred_unsw_d, target_names=shared_classes, output_dict=True, zero_division=0)

    res_d = {
        "name": "Model D: Multi-Dataset + Feature Debiasing (No OS Windows)",
        "train_seconds": round(took_d, 2),
        "cicids2017_accuracy": round(float(acc_cic_d), 4),
        "cicids2017_macro_f1": round(float(f1_cic_d), 4),
        "unsw_nb15_accuracy": round(float(acc_unsw_d), 4),
        "unsw_nb15_macro_f1": round(float(f1_unsw_d), 4),
        "cross_domain_harmonic_f1": round(float(2 * f1_cic_d * f1_unsw_d / max(f1_cic_d + f1_unsw_d, 1e-12)), 4),
        "unsw_class_breakdown": {
            c: {
                "precision": round(rep_unsw_d[c]["precision"], 4),
                "recall": round(rep_unsw_d[c]["recall"], 4),
                "f1": round(rep_unsw_d[c]["f1-score"], 4),
                "support": int(rep_unsw_d[c]["support"]),
            }
            for c in shared_classes
        },
    }
    results["experiments"]["model_d_debiased"] = res_d
    print(f"  -> CICIDS2017 Macro-F1: {res_d['cicids2017_macro_f1']:.4f} | UNSW-NB15 Macro-F1: {res_d['unsw_nb15_macro_f1']:.4f} (took {took_d:.1f}s)")

    # Save benchmark artifact
    out_file = ARTIFACTS / "generalization_benchmark.json"
    out_file.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\n[SUCCESS] Wrote comprehensive benchmark to {out_file}")

    return results


if __name__ == "__main__":
    run_benchmark()
