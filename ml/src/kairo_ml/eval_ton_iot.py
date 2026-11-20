"""Evaluation of Kairo on ToN-IoT / BigFlow-NIDS (ScienceDirect 2026 paper).

Tests Kairo's detection capability on a completely new IoT dataset (neither CICIDS nor UNSW):
ToN-IoT contains Scanning, DDoS, DoS, Password Brute-force, XSS, and SQL Injection.
"""

import io
import urllib.request
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score
from kairo_ml.config import ARTIFACTS

# Attack map to Kairo taxonomy
TON_TO_KAIRO = {
    "Benign": "Normal",
    "scanning": "Port Scan",
    "ddos": "DDoS",
    "dos": "DoS",
    "password": "Brute Force",
    "xss": "Web Attack",
    "injection": "Web Attack",
    "backdoor": "Botnet",
    "ransomware": "Botnet",
}

def load_ton_iot_sample(num_bytes=1048576): # 1 MB slice
    url = "https://huggingface.co/datasets/Nora9029/NF-ToN-IoT-v2/resolve/main/NF-ToN-IoT-v2-test.csv"
    print(f"Fetching sample from ToN-IoT / BigFlow-NIDS mirror...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Range": f"bytes=0-{num_bytes}"})
    chunk = urllib.request.urlopen(req).read().decode("utf-8", errors="ignore")
    lines = chunk.splitlines()[:-1]
    df = pd.read_csv(io.StringIO("\n".join(lines)))
    print(f"Loaded {len(df):,} raw flows from ToN-IoT dataset")
    return df

def main():
    print("=" * 70)
    print(" KAIRO EVALUATION ON TON-IOT / BIGFLOW-NIDS (SCIENCEDIRECT 2026)")
    print("=" * 70)
    
    df = load_ton_iot_sample(num_bytes=1572864) # 1.5 MB slice (~10,000 flows)
    df["clean_label"] = df["Attack"].map(TON_TO_KAIRO)
    valid = df[df["clean_label"].notna()].copy()
    
    print("\nAttack Class Distribution in ToN-IoT slice:")
    for c, cnt in valid["clean_label"].value_counts().items():
        print(f"  - {c:<15}: {cnt:,} flows")
        
    y_true = valid["clean_label"].to_numpy()
    
    # -------------------------------------------------------------
    # 1. Google-Grade Shield 1: Behavioral Invariant Heuristics
    # -------------------------------------------------------------
    # Port Scan: Probing non-standard ports with minimal backward bytes & small packets
    is_scan = (valid["OUT_PKTS"] <= 1) & (valid["IN_PKTS"] <= 3) & (~valid["L4_DST_PORT"].isin([80, 443, 53, 8080]))
    
    # DDoS / DoS: High packet rate or flood volume directed at standard service ports
    flow_dur_sec = np.maximum(valid["FLOW_DURATION_MILLISECONDS"] / 1000.0, 0.001)
    pkts_per_sec = (valid["IN_PKTS"] + valid["OUT_PKTS"]) / flow_dur_sec
    is_ddos = (pkts_per_sec > 2000) | ((valid["IN_PKTS"] > 50) & (valid["OUT_PKTS"] == 0))
    is_dos = (valid["FLOW_DURATION_MILLISECONDS"] < 100) & (valid["IN_BYTES"] > 2000) & (valid["OUT_BYTES"] == 0)
    
    # Brute Force: High connection rate to authentication ports (21, 22, 3389) or HTTP POST credential stuffing
    is_brute = valid["L4_DST_PORT"].isin([21, 22, 3389]) | ((valid["L4_DST_PORT"] == 80) & (valid["IN_BYTES"] > 500) & (valid["IN_BYTES"] < 1200) & (valid["FLOW_DURATION_MILLISECONDS"] < 500))
    
    # Web Attack: HTTP payload anomalies
    is_web = valid["L4_DST_PORT"].isin([80, 443, 8080]) & (valid["IN_BYTES"] > 1200) & (valid["OUT_BYTES"] < 500)

    # Combine into Behavioral Invariant Verdict
    y_pred_invariant = np.array(["Normal"] * len(valid))
    y_pred_invariant[is_scan] = "Port Scan"
    y_pred_invariant[is_ddos] = "DDoS"
    y_pred_invariant[is_dos & (y_pred_invariant == "Normal")] = "DoS"
    y_pred_invariant[is_brute & (y_pred_invariant == "Normal")] = "Brute Force"
    y_pred_invariant[is_web & (y_pred_invariant == "Normal")] = "Web Attack"

    # Evaluate Invariant Shield Zero-Shot
    classes_present = sorted(list(set(y_true)))
    acc_inv = accuracy_score(y_true, y_pred_invariant)
    f1_inv = f1_score(y_true, y_pred_invariant, labels=classes_present, average="macro", zero_division=0)
    
    print("\n" + "=" * 70)
    print(" ZERO-SHOT BEHAVIORAL INVARIANT SHIELD PERFORMANCE (NO TRAINING)")
    print(f" Overall Accuracy : {acc_inv * 100:.2f}%")
    print(f" Macro-F1 Score   : {f1_inv * 100:.2f}%")
    print("=" * 70)
    print(classification_report(y_true, y_pred_invariant, labels=classes_present, digits=4, zero_division=0))
    
    # Binary Threat Detection (Attack vs Benign)
    att_true = y_true != "Normal"
    att_pred = y_pred_invariant != "Normal"
    rec = (att_true & att_pred).sum() / max(att_true.sum(), 1)
    fpr = ((~att_true) & att_pred).sum() / max((~att_true).sum(), 1)
    
    print(f"Binary Attack Detection Recall: {rec * 100:.2f}%")
    print(f"False Alarm Rate (FPR)        : {fpr * 100:.2f}%")

if __name__ == "__main__":
    main()
