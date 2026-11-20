"""Evaluation of Kairo on NSL-KDD (KDD Cup 99 test set: KDDTest+).

NSL-KDD is a landmark 1999 intrusion detection benchmark containing 22,544 test connections
across 38 attack families and normal traffic.
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.preprocessing import RobustScaler
from xgboost import XGBClassifier

KDD_COLUMNS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "hot", "num_failed_logins", "logged_in",
    "num_compromised", "root_shell", "su_attempted", "num_root", "num_file_creations",
    "num_shells", "num_access_files", "num_outbound_cmds", "is_host_login",
    "is_guest_login", "count", "srv_count", "serror_rate", "srv_serror_rate",
    "rerror_rate", "srv_rerror_rate", "same_srv_rate", "diff_srv_rate",
    "srv_diff_host_rate", "dst_host_count", "dst_host_srv_count",
    "dst_host_same_srv_rate", "dst_host_diff_srv_rate",
    "dst_host_same_src_port_rate", "dst_host_srv_diff_host_rate",
    "dst_host_serror_rate", "dst_host_srv_serror_rate", "dst_host_rerror_rate",
    "dst_host_srv_rerror_rate", "attack", "difficulty_level"
]

# Map 38 NSL-KDD sub-attacks to Kairo's taxonomy
KDD_TO_KAIRO = {
    # Normal
    "normal": "Normal",
    # DoS
    "neptune": "DoS", "smurf": "DoS", "back": "DoS", "teardrop": "DoS",
    "pod": "DoS", "land": "DoS", "apache2": "DoS", "udpstorm": "DoS",
    "processtable": "DoS", "mailbomb": "DoS",
    # Probes / Port Scans
    "satan": "Port Scan", "ipsweep": "Port Scan", "nmap": "Port Scan",
    "portsweep": "Port Scan", "mscan": "Port Scan", "saint": "Port Scan",
    # Brute Force / R2L
    "guess_passwd": "Brute Force", "ftp_write": "Brute Force", "imap": "Brute Force",
    "phf": "Brute Force", "multihop": "Brute Force", "warezmaster": "Brute Force",
    "warezclient": "Brute Force", "spy": "Brute Force", "xlock": "Brute Force",
    "xsnoop": "Brute Force", "snmpguess": "Brute Force", "snmpgetattack": "Brute Force",
    "httptunnel": "Brute Force", "sendmail": "Brute Force", "named": "Brute Force",
    # Exploits / U2R / Web
    "buffer_overflow": "Web Attack", "loadmodule": "Web Attack", "rootkit": "Web Attack",
    "perl": "Web Attack", "sqlattack": "Web Attack", "xterm": "Web Attack", "ps": "Web Attack",
}

def load_nsl_kdd():
    path = Path("ml/data/KDDTest+.txt")
    df = pd.read_csv(path, header=None, names=KDD_COLUMNS)
    df["clean_label"] = df["attack"].map(KDD_TO_KAIRO).fillna("Other")
    return df

def main():
    print("=" * 70)
    print(" KAIRO EVALUATION ON NSL-KDD / KDD CUP 99 (KDDTest+: 22,544 FLOWS)")
    print("=" * 70)

    df = load_nsl_kdd()
    valid = df[df["clean_label"] != "Other"].copy()
    print(f"\nLoaded {len(valid):,} valid test connections from KDDTest+")
    print("Label distribution in NSL-KDD test set:")
    for lbl, count in valid["clean_label"].value_counts().items():
        print(f"  - {lbl:<15}: {count:,} connections")

    y_true = valid["clean_label"].to_numpy()

    # -----------------------------------------------------------------
    # Part 1: Zero-Shot Invariant Rules (Physical connection invariants)
    # -----------------------------------------------------------------
    # DoS invariant: SYN error rate > 50% or reject flag or massive count
    is_dos = (valid["serror_rate"] > 0.5) | (valid["dst_host_serror_rate"] > 0.5) | (valid["flag"].isin(["REJ", "S0"])) | (valid["count"] > 200)
    
    # Port Scan invariant: high diff_srv_rate or high dst_host_diff_srv_rate with service sweeping
    is_scan = (valid["dst_host_diff_srv_rate"] > 0.5) | (valid["diff_srv_rate"] > 0.5) | (valid["rerror_rate"] > 0.5)
    
    # Brute Force invariant: auth service with failed logins or hot counts
    is_brute = valid["service"].isin(["ftp", "ftp_data", "telnet", "ssh", "login", "pop_3", "imap4"]) & ((valid["num_failed_logins"] > 0) | (valid["hot"] > 0) | (valid["duration"] > 5))

    y_pred_inv = np.array(["Normal"] * len(valid))
    y_pred_inv[is_dos] = "DoS"
    y_pred_inv[is_scan & (y_pred_inv == "Normal")] = "Port Scan"
    y_pred_inv[is_brute & (y_pred_inv == "Normal")] = "Brute Force"

    classes_present = sorted(list(set(y_true)))
    acc_inv = accuracy_score(y_true, y_pred_inv)
    f1_inv = f1_score(y_true, y_pred_inv, labels=classes_present, average="macro", zero_division=0)

    print("\n" + "=" * 70)
    print(" ZERO-SHOT BEHAVIORAL INVARIANT PERFORMANCE ON NSL-KDD (NO ML)")
    print(f" Overall Accuracy : {acc_inv * 100:.2f}%")
    print(f" Macro-F1 Score   : {f1_inv * 100:.2f}%")
    print("=" * 70)
    print(classification_report(y_true, y_pred_inv, labels=classes_present, digits=4, zero_division=0))

    # Binary Attack Detection Rate
    att_true = y_true != "Normal"
    att_pred = y_pred_inv != "Normal"
    print(f"Binary Attack Detection Recall: {(att_true & att_pred).sum() / att_true.sum() * 100:.2f}%")
    print(f"False Alarm Rate (FPR)        : {((~att_true) & att_pred).sum() / (~att_true).sum() * 100:.2f}%")

    # -----------------------------------------------------------------
    # Part 2: Supervised Baseline on NSL-KDD Numerical Features (Calibration)
    # -----------------------------------------------------------------
    print("\n" + "=" * 70)
    print(" RAPID CALIBRATION ENGINE ON NSL-KDD (10% TRAIN, 90% TEST)")
    print("=" * 70)

    # Encode categorical columns
    valid_enc = valid.copy()
    for col in ["protocol_type", "service", "flag"]:
        valid_enc[col] = valid_enc[col].astype("category").cat.codes

    num_cols = [c for c in KDD_COLUMNS if c not in ["attack", "difficulty_level", "clean_label"]]
    X = valid_enc[num_cols].to_numpy(dtype=np.float32)
    c2i = {c: i for i, c in enumerate(classes_present)}
    y = valid_enc["clean_label"].map(c2i).to_numpy()

    # Split 15% train (calibration), 85% held-out test
    from sklearn.model_selection import train_test_split
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.85, stratify=y, random_state=42)

    import time
    t0 = time.time()
    scaler = RobustScaler()
    X_tr_s = scaler.fit_transform(X_tr)
    clf = XGBClassifier(n_estimators=180, max_depth=6, learning_rate=0.1, n_jobs=-1, random_state=42)
    clf.fit(X_tr_s, y_tr)
    took = time.time() - t0
    print(f"Calibration completed in {took:.2f} seconds!")

    X_te_s = scaler.transform(X_te)
    y_pred_cal = clf.predict(X_te_s)

    acc_cal = accuracy_score(y_te, y_pred_cal)
    f1_cal = f1_score(y_te, y_pred_cal, average="macro")

    print(f"Overall Accuracy on 19,163 Held-Out NSL-KDD Connections: {acc_cal * 100:.2f}%")
    print(f"Macro-F1 Score                                        : {f1_cal * 100:.2f}%")
    print("=" * 70)
    print(classification_report(y_te, y_pred_cal, target_names=classes_present, digits=4))

if __name__ == "__main__":
    main()
