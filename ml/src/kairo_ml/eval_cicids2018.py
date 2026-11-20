"""Evaluation of Kairo on a completely new 3rd dataset: CSE-CIC-IDS2018 (AWS Cloud, 2018).

Fetches sample byte ranges from the official CSE-CIC-IDS2018 parquet/CSV mirror on HuggingFace,
maps the 2018 features to Kairo's 30-feature vector, and runs Kairo's deployed model.
"""

import io
import json
import urllib.request
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, accuracy_score, f1_score
from kairo_ml.config import ARTIFACTS

# 2018 Column -> Kairo 30 Feature Name mapping
MAP_2018_TO_KAIRO = {
    "Pkt_Len_Mean": "Packet Length Mean",
    "Pkt_Len_Var": "Packet Length Variance",
    "Init_Bwd_Win_Byts": "Init_Win_bytes_backward",
    "Fwd_Pkt_Len_Max": "Fwd Packet Length Max",
    "Bwd_Pkt_Len_Max": "Bwd Packet Length Max",
    "Init_Fwd_Win_Byts": "Init_Win_bytes_forward",
    "Fwd_Pkt_Len_Mean": "Fwd Packet Length Mean",
    "Flow_Duration": "Flow Duration",
    "Dst_Port": "Destination Port",
    "Bwd_Pkts/s": "Bwd Packets/s",
    "Fwd_IAT_Mean": "Fwd IAT Mean",
    "Fwd_Pkts/s": "Fwd Packets/s",
    "Flow_Pkts/s": "Flow Packets/s",
    "Flow_IAT_Mean": "Flow IAT Mean",
    "Flow_IAT_Std": "Flow IAT Std",
    "Fwd_IAT_Std": "Fwd IAT Std",
    "Bwd_IAT_Tot": "Bwd IAT Total",
    "Bwd_IAT_Mean": "Bwd IAT Mean",
    "Fwd_Seg_Size_Min": "min_seg_size_forward",
    "Bwd_Pkt_Len_Min": "Bwd Packet Length Min",
    "Bwd_IAT_Std": "Bwd IAT Std",
    "Fwd_IAT_Min": "Fwd IAT Min",
    "Bwd_IAT_Min": "Bwd IAT Min",
    "Idle_Min": "Idle Min",
    "Pkt_Len_Min": "Min Packet Length",
    "Flow_IAT_Min": "Flow IAT Min",
    "Fwd_Pkt_Len_Min": "Fwd Packet Length Min",
    "Active_Min": "Active Min",
    "Active_Mean": "Active Mean",
    "Active_Max": "Active Max",
}

LABEL_MAP_2018 = {
    "Benign": "Normal",
    "FTP-BruteForce": "Brute Force",
    "SSH-Bruteforce": "Brute Force",
    "DoS attacks-GoldenEye": "DoS",
    "DoS attacks-Slowloris": "DoS",
    "DoS attacks-SlowHTTPTest": "DoS",
    "DoS attacks-Hulk": "DoS",
    "DDoS attacks-LOIC-HTTP": "DDoS",
    "DDOS attack-HOIC": "DDoS",
    "DDOS attack-LOIC-UDP": "DDoS",
    "Brute Force -Web": "Web Attack",
    "Brute Force -XSS": "Web Attack",
    "SQL Injection": "Web Attack",
    "Bot": "Botnet",
}

def fetch_sample(offsets_mb=(0, 150, 400, 750, 1100, 1400), chunk_mb=1.5):
    cache_path = ARTIFACTS.parent / "data" / "cse_cicids2018_test_17k.csv"
    if cache_path.exists():
        print(f"Loading cached 3rd dataset from {cache_path}...")
        return pd.read_csv(cache_path, low_memory=False)

    url = "https://huggingface.co/datasets/abluva/CSE-CIC-IDS2018-V2/resolve/main/CSE-CIC-IDS-2018-V2.csv"
    headers_req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Range": "bytes=0-2048"})
    header_line = urllib.request.urlopen(headers_req).read().decode("utf-8", errors="ignore").splitlines()[0]
    
    frames = []
    print(f"Fetching chunks from {len(offsets_mb)} offsets across the 1.85 GB CSE-CIC-IDS2018 dataset...")
    for off in offsets_mb:
        start = int(off * 1024 * 1024)
        end = start + int(chunk_mb * 1024 * 1024)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Range": f"bytes={start}-{end}"})
        try:
            chunk = urllib.request.urlopen(req).read().decode("utf-8", errors="ignore")
            lines = chunk.splitlines()[1:-1] # drop partial first and last line
            if not lines:
                continue
            csv_data = header_line + "\n" + "\n".join(lines)
            df = pd.read_csv(io.StringIO(csv_data), low_memory=False)
            frames.append(df)
            print(f"  Offset {off} MB: loaded {len(df)} rows, labels: {df['label'].value_counts().to_dict()}")
        except Exception as e:
            print(f"  Offset {off} MB failed: {e}")
            
    combined = pd.concat(frames, ignore_index=True)
    combined.to_csv(cache_path, index=False)
    print(f"Saved {len(combined)} flows to {cache_path}")
    return combined

def main():
    print("=" * 70)
    print(" KAIRO ZERO-SHOT BENCHMARK ON NEW 3RD DATASET: CSE-CIC-IDS2018 (AWS)")
    print("=" * 70)
    
    # 1. Fetch raw data
    raw = fetch_sample()
    print(f"\nTotal raw flows acquired from CSE-CIC-IDS2018: {len(raw):,}")
    
    # 2. Filter & map labels
    raw["clean_label"] = raw["label"].map(LABEL_MAP_2018)
    valid = raw[raw["clean_label"].notna()].copy()
    print("Label distribution in test slice:")
    for lbl, count in valid["clean_label"].value_counts().items():
        print(f"  - {lbl:<15}: {count:,}")
        
    # 3. Rename columns to Kairo 30 features
    renamed = valid.rename(columns=MAP_2018_TO_KAIRO)
    
    # 4. Load deployed Kairo model
    art = joblib.load(ARTIFACTS / "model.joblib")
    features = art["features"]
    model = art["model"]
    
    # Ensure all 30 features are present
    missing = [f for f in features if f not in renamed.columns]
    if missing:
        print(f"Error: Missing features: {missing}")
        return
        
    X = renamed[features].to_numpy(dtype=np.float32)
    X = np.nan_to_num(X, nan=0.0, posinf=1e6, neginf=-1e6)
    y_true = renamed["clean_label"].to_numpy()
    
    print("\nRunning Kairo inference...")
    y_pred_idx = model.predict(X)
    classes_list = art["classes"]
    y_pred = np.array([classes_list[i] for i in y_pred_idx])
    
    # Calculate metrics
    acc = accuracy_score(y_true, y_pred)
    classes_present = sorted(list(set(y_true)))
    macro_f1 = f1_score(y_true, y_pred, labels=classes_present, average="macro", zero_division=0)
    
    print("\n" + "=" * 70)
    print(f" ZERO-SHOT PERFORMANCE ON CSE-CIC-IDS2018 (AWS CLOUD, 2018)")
    print(f" Overall Accuracy: {acc * 100:.2f}%")
    print(f" Macro-F1 Score  : {macro_f1 * 100:.2f}%")
    print("=" * 70)
    
    rep = classification_report(y_true, y_pred, labels=classes_present, zero_division=0)
    print("\nClassification Report:\n" + rep)
    
    # Attack vs Benign (Binary detection rate)
    is_attack_true = y_true != "Normal"
    is_attack_pred = y_pred != "Normal"
    binary_recall = (is_attack_true & is_attack_pred).sum() / max(is_attack_true.sum(), 1)
    binary_fpr = (~is_attack_true & is_attack_pred).sum() / max((~is_attack_true).sum(), 1)
    
    print(f"Binary Attack Detection Recall: {binary_recall * 100:.2f}%")
    print(f"False Alarm Rate (FPR)        : {binary_fpr * 100:.2f}%")

if __name__ == "__main__":
    main()
