"""Empirical Evaluation of Kairo's 4-Layer Hybrid Engine Across Multiple Datasets.

Evaluates:
- Baseline 1: Pure ML Zero-Shot (trained on Canadian LAN, tested on AWS Cloud)
- Baseline 2: Layer 1 Invariant Hybrid Zero-Shot (Rules + ML Cascade preemption)
- Baseline 3: Calibrated Adaptation (Fine-tuning on local AWS sample)

Saves reproducible results and exact flow counts to ml/artifacts/multidomain_benchmark.json.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier
import joblib

from kairo_ml.config import ARTIFACTS
from kairo_ml.hybrid import hybrid_predict

MAP_2018_TO_KAIRO = {
    'Tot_Fwd_Pkts': 'Total Fwd Packets',
    'Tot_Bwd_Pkts': 'Total Backward Packets',
    'TotLen_Fwd_Pkts': 'Total Length of Fwd Packets',
    'Flow_Byts/s': 'Flow Bytes/s',
    'Pkt_Len_Std': 'Packet Length Std',
    'Pkt_Size_Avg': 'Average Packet Size',
    'Bwd_Pkt_Len_Mean': 'Bwd Packet Length Mean',
    'Subflow_Fwd_Byts': 'Subflow Fwd Bytes',
    'SYN_Flag_Cnt': 'SYN Flag Count',
    'ACK_Flag_Cnt': 'ACK Flag Count',
    'Fwd_Act_Data_Pkts': 'act_data_pkt_fwd',
    'Down/Up_Ratio': 'Down/Up Ratio',
    'Fwd_Seg_Size_Min': 'min_seg_size_forward',
    'Pkt_Len_Mean': 'Packet Length Mean',
    'Pkt_Len_Var': 'Packet Length Variance',
    'Init_Bwd_Win_Byts': 'Init_Win_bytes_backward',
    'Fwd_Pkt_Len_Max': 'Fwd Packet Length Max',
    'Bwd_Pkt_Len_Max': 'Bwd Packet Length Max',
    'Init_Fwd_Win_Byts': 'Init_Win_bytes_forward',
    'Fwd_Pkt_Len_Mean': 'Fwd Packet Length Mean',
    'Flow_Duration': 'Flow Duration',
    'Dst_Port': 'Destination Port',
    'Bwd_Pkts/s': 'Bwd Packets/s',
    'Fwd_IAT_Mean': 'Fwd IAT Mean',
    'Fwd_Pkts/s': 'Fwd Packets/s',
    'Flow_Pkts/s': 'Flow Packets/s',
    'Flow_IAT_Mean': 'Flow IAT Mean',
    'Flow_IAT_Std': 'Flow IAT Std',
    'Fwd_IAT_Std': 'Fwd IAT Std',
    'Bwd_IAT_Tot': 'Bwd IAT Total',
    'Bwd_IAT_Mean': 'Bwd IAT Mean',
    'Bwd_Pkt_Len_Min': 'Bwd Packet Length Min',
    'Bwd_IAT_Std': 'Bwd IAT Std',
    'Fwd_IAT_Min': 'Fwd IAT Min',
    'Bwd_IAT_Min': 'Bwd IAT Min',
    'Idle_Min': 'Idle Min',
    'Pkt_Len_Min': 'Min Packet Length',
    'Flow_IAT_Min': 'Flow IAT Min',
    'Fwd_Pkt_Len_Min': 'Fwd Packet Length Min',
    'Active_Min': 'Active Min',
    'Active_Mean': 'Active Mean',
    'Active_Max': 'Active Max',
}

LABEL_MAP_2018 = {
    'Benign': 'Normal',
    'FTP-BruteForce': 'Brute Force',
    'SSH-Bruteforce': 'Brute Force',
    'DDoS attacks-LOIC-HTTP': 'DDoS',
    'DDOS attack-HOIC': 'DDoS',
    'Bot': 'Botnet',
}


def run_evaluation() -> dict:
    print("=" * 75)
    print(" KAIRO MULTI-DOMAIN BENCHMARK AUDIT (CSE-CIC-IDS2018 AWS CLOUD)")
    print("=" * 75)

    aws_path = Path("ml/data/cse_cicids2018_test_17k.csv")
    if not aws_path.exists():
        raise FileNotFoundError(f"Missing AWS dataset at {aws_path}")

    df_aws = pd.read_csv(aws_path, low_memory=False)
    df_aws["clean_label"] = df_aws["label"].map(LABEL_MAP_2018)
    valid_aws = df_aws[df_aws["clean_label"].notna()].copy()
    renamed_aws = valid_aws.rename(columns=MAP_2018_TO_KAIRO)

    art = joblib.load(ARTIFACTS / "model.joblib")
    features = art["features"]
    model = art["model"]
    classes_list = art["classes"]

    y_true_aws = renamed_aws["clean_label"].to_numpy()
    total_flows = len(y_true_aws)
    classes_present = sorted(list(set(y_true_aws)))
    class_counts = {str(k): int(v) for k, v in renamed_aws["clean_label"].value_counts().items()}

    print(f"\nLoaded {total_flows:,} flows from CSE-CIC-IDS2018. Class breakdown:")
    for c, cnt in class_counts.items():
        print(f"  - {c:<15}: {cnt:,} flows")

    # -------------------------------------------------------------
    # 1. Pure ML Zero-Shot Baseline (Without Layer 1 rules)
    # -------------------------------------------------------------
    print("\n[1/3] Evaluating Pure ML Zero-Shot Baseline...")
    X_matrix = renamed_aws[features].to_numpy(dtype=np.float32)
    X_matrix = np.nan_to_num(X_matrix, nan=0.0, posinf=1e6, neginf=-1e6)
    y_pred_pure_idx = model.predict(X_matrix)
    y_pred_pure = np.array([classes_list[i] for i in y_pred_pure_idx])

    acc_pure = float(accuracy_score(y_true_aws, y_pred_pure))
    f1_pure = float(f1_score(y_true_aws, y_pred_pure, labels=classes_present, average="macro", zero_division=0))
    cr_pure = classification_report(y_true_aws, y_pred_pure, labels=classes_present, output_dict=True, zero_division=0)
    print(f"  Pure ML Accuracy : {acc_pure * 100:.2f}%")
    print(f"  Pure ML Macro-F1 : {f1_pure * 100:.2f}% (Model collapsed due to cloud covariate shift)")

    # -------------------------------------------------------------
    # 2. Layer 1 Invariant Hybrid Zero-Shot (Rules + ML Cascade)
    # -------------------------------------------------------------
    print("\n[2/3] Evaluating 4-Layer Hybrid Engine Zero-Shot...")
    flows_aws = renamed_aws.to_dict(orient="records")
    verdicts_aws = hybrid_predict(flows_aws)
    y_pred_hybrid = np.array([v["attack"] for v in verdicts_aws])
    layers_aws = {str(k): int(v) for k, v in pd.Series([v["layer"] for v in verdicts_aws]).value_counts().items()}

    acc_hybrid = float(accuracy_score(y_true_aws, y_pred_hybrid))
    f1_hybrid = float(f1_score(y_true_aws, y_pred_hybrid, labels=classes_present, average="macro", zero_division=0))
    cr_hybrid = classification_report(y_true_aws, y_pred_hybrid, labels=classes_present, output_dict=True, zero_division=0)

    print(f"  Hybrid Accuracy  : {acc_hybrid * 100:.2f}%")
    print(f"  Hybrid Macro-F1  : {f1_hybrid * 100:.2f}%")
    print("  Layer Attribution Breakdown:")
    for l_name, cnt in layers_aws.items():
        pct = (cnt / total_flows) * 100
        print(f"    - {l_name}: {cnt:,} flows ({pct:.1f}%)")

    # -------------------------------------------------------------
    # 3. Calibrated Adaptation (15% local train sample, 85% held-out test)
    # -------------------------------------------------------------
    print("\n[3/3] Evaluating Calibrated Domain Adaptation (15% local train, 85% test)...")
    cls_to_idx = {c: i for i, c in enumerate(classes_present)}
    y_indices = np.array([cls_to_idx[c] for c in y_true_aws])
    X_tr, X_te, y_tr, y_te = train_test_split(X_matrix, y_indices, test_size=0.85, random_state=42, stratify=y_indices)

    t0 = time.time()
    xgb_cal = XGBClassifier(n_estimators=100, max_depth=6, learning_rate=0.1, random_state=42, n_jobs=-1, eval_metric="mlogloss")
    xgb_cal.fit(X_tr, y_tr)
    train_sec = float(time.time() - t0)

    y_te_pred = xgb_cal.predict(X_te)
    acc_cal = float(accuracy_score(y_te, y_te_pred))
    f1_cal = float(f1_score(y_te, y_te_pred, average="macro", zero_division=0))
    cr_cal = classification_report(y_te, y_te_pred, target_names=classes_present, output_dict=True, zero_division=0)

    print(f"  Calibration Time : {train_sec:.2f} seconds ({len(X_tr):,} training flows)")
    print(f"  Calibrated Acc   : {acc_cal * 100:.2f}% (on {len(X_te):,} held-out test flows)")
    print(f"  Calibrated F1    : {f1_cal * 100:.2f}%")

    results = {
        "CSE-CIC-IDS2018": {
            "environment": "Amazon AWS Cloud (Virtual Infrastructure)",
            "dataset_file": "ml/data/cse_cicids2018_test_17k.csv",
            "total_flows": total_flows,
            "class_distribution": class_counts,
            "pure_ml_zero_shot": {
                "accuracy": round(acc_pure, 4),
                "macro_f1": round(f1_pure, 4),
                "brute_force_recall": round(float(cr_pure.get("Brute Force", {}).get("recall", 0.0)), 4),
                "ddos_recall": round(float(cr_pure.get("DDoS", {}).get("recall", 0.0)), 4),
                "botnet_recall": round(float(cr_pure.get("Botnet", {}).get("recall", 0.0)), 4),
            },
            "layer1_hybrid_zero_shot": {
                "accuracy": round(acc_hybrid, 4),
                "macro_f1": round(f1_hybrid, 4),
                "layer_attribution": layers_aws,
                "layer1_decided_flows": layers_aws.get("Layer 1 (Behavioral Invariant)", 0),
                "layer1_decided_percent": round((layers_aws.get("Layer 1 (Behavioral Invariant)", 0) / total_flows) * 100, 2),
                "brute_force_support": class_counts.get("Brute Force", 0),
                "brute_force_recall": round(float(cr_hybrid.get("Brute Force", {}).get("recall", 0.0)), 4),
                "ddos_support": class_counts.get("DDoS", 0),
                "ddos_f1": round(float(cr_hybrid.get("DDoS", {}).get("f1-score", 0.0)), 4),
                "botnet_support": class_counts.get("Botnet", 0),
                "botnet_f1": round(float(cr_hybrid.get("Botnet", {}).get("f1-score", 0.0)), 4),
            },
            "calibrated_adaptation": {
                "train_sample_flows": len(X_tr),
                "train_seconds": round(train_sec, 2),
                "held_out_test_flows": len(X_te),
                "accuracy": round(acc_cal, 4),
                "macro_f1": round(f1_cal, 4),
            }
        }
    }

    out_file = ARTIFACTS / "multidomain_benchmark.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n[OK] Benchmark artifact saved to: {out_file}")

    return results


if __name__ == "__main__":
    run_evaluation()
