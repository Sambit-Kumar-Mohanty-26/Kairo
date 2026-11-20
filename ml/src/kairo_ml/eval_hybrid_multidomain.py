"""Empirical Evaluation of Kairo's 4-Layer Hybrid Engine Across Multiple Datasets.

Evaluates:
- Layer 1: Behavioral Invariants (kairo_ml.rules)
- Layer 2: Unsupervised Anomaly Baselines (kairo_ml.anomaly)
- Layer 3: Two-Stage Cascade ML (kairo_ml.cascade)
- Layer 4: In-Memory IP Reputation / Threat Intel (kairo_ml.threat_intel)

Saves reproducible results to ml/artifacts/multidomain_benchmark.json.
"""

from __future__ import annotations

import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score
from kairo_ml.config import ARTIFACTS
from kairo_ml.hybrid import hybrid_predict
from kairo_ml.eval_cicids2018 import MAP_2018_TO_KAIRO, LABEL_MAP_2018


def run_evaluation() -> dict:
    print("=" * 75)
    print(" KAIRO 4-LAYER HYBRID ENGINE MULTI-DOMAIN BENCHMARK")
    print("=" * 75)

    results = {}

    # -------------------------------------------------------------
    # 1. Benchmark on CSE-CIC-IDS2018 (AWS Cloud Infrastructure)
    # -------------------------------------------------------------
    aws_path = Path("ml/data/cse_cicids2018_test_17k.csv")
    if aws_path.exists():
        print("\n[1] Evaluating on CSE-CIC-IDS2018 (AWS Cloud, 17,095 flows)...")
        df_aws = pd.read_csv(aws_path, low_memory=False)
        df_aws["clean_label"] = df_aws["label"].map(LABEL_MAP_2018)
        valid_aws = df_aws[df_aws["clean_label"].notna()].copy()
        renamed_aws = valid_aws.rename(columns=MAP_2018_TO_KAIRO)

        flows_aws = renamed_aws.to_dict(orient="records")
        y_true_aws = renamed_aws["clean_label"].to_numpy()

        verdicts_aws = hybrid_predict(flows_aws)
        y_pred_aws = np.array([v["attack"] for v in verdicts_aws])
        layers_aws = {str(k): int(v) for k, v in pd.Series([v["layer"] for v in verdicts_aws]).value_counts().items()}

        classes_aws = sorted(list(set(y_true_aws)))
        acc_aws = float(accuracy_score(y_true_aws, y_pred_aws))
        f1_aws = float(f1_score(y_true_aws, y_pred_aws, labels=classes_aws, average="macro", zero_division=0))
        cr_aws = classification_report(y_true_aws, y_pred_aws, labels=classes_aws, output_dict=True, zero_division=0)

        print(f"  Overall Accuracy : {acc_aws * 100:.2f}%")
        print(f"  Macro-F1 Score   : {f1_aws * 100:.2f}%")
        print("  Attribution by Layer:")
        for l_name, cnt in layers_aws.items():
            print(f"    - {l_name}: {cnt:,} flows")

        results["CSE-CIC-IDS2018"] = {
            "environment": "Amazon AWS Cloud",
            "total_flows": len(flows_aws),
            "overall_accuracy": round(acc_aws, 4),
            "macro_f1": round(f1_aws, 4),
            "layer_attribution": layers_aws,
            "classes": classes_aws,
            "brute_force_recall": round(float(cr_aws.get("Brute Force", {}).get("recall", 0.0)), 4),
            "ddos_f1": round(float(cr_aws.get("DDoS", {}).get("f1-score", 0.0)), 4),
        }
    else:
        print(f"\n[1] Skipping CSE-CIC-IDS2018 ({aws_path} not found)")

    # -------------------------------------------------------------
    # Save benchmark artifact to ml/artifacts/multidomain_benchmark.json
    # -------------------------------------------------------------
    out_file = ARTIFACTS / "multidomain_benchmark.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n[OK] Benchmark artifact saved to: {out_file}")

    return results


if __name__ == "__main__":
    run_evaluation()
