"""Movement 3: move the model to a capture it has never seen.

    python -m kairo_ml.generalize

CICIDS2017 is one network, one week, 2017. A score on its own test split says
the model learned that week. The only way to find out whether it learned
*attacks* is to hand it a different capture from a different network in a
different year and keep the labels honest.

UNSW-NB15 is that capture. These flows are the UNSW pcaps re-extracted with
CICFlowMeter, so the feature space is the same measurements — but the two
extractor versions name nineteen columns differently, and UNSW's taxonomy is
its own. Both are handled explicitly below rather than papered over.

Two results are reported, because they answer different questions:

  1. Per-family, on the three families that genuinely exist in both datasets.
     Scoring the model on Fuzzers or Worms would be marking it wrong for not
     knowing a class nobody taught it.
  2. Attack vs benign, on everything including the families it was never
     shown. This is the question that actually matters in deployment: when
     something new arrives, does it at least stop looking normal?
"""

from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .config import ARTIFACTS, CLASSES, ROOT
from .data import load_raw

UNSW = ROOT / "data" / "unsw"

#: CICFlowMeter v4 (UNSW extraction) -> the v3 names CICIDS2017 shipped with.
#: Same measurement, different spelling; "CWE Flag Count" is v3's own typo for
#: CWR and is preserved because that is what the training columns are called.
RENAME = {
    "Total Fwd Packet": "Total Fwd Packets",
    "Total Bwd packets": "Total Backward Packets",
    "Total Length of Fwd Packet": "Total Length of Fwd Packets",
    "Total Length of Bwd Packet": "Total Length of Bwd Packets",
    "Packet Length Min": "Min Packet Length",
    "Packet Length Max": "Max Packet Length",
    "Fwd Segment Size Avg": "Avg Fwd Segment Size",
    "Bwd Segment Size Avg": "Avg Bwd Segment Size",
    "Fwd Bytes/Bulk Avg": "Fwd Avg Bytes/Bulk",
    "Fwd Packet/Bulk Avg": "Fwd Avg Packets/Bulk",
    "Fwd Bulk Rate Avg": "Fwd Avg Bulk Rate",
    "Bwd Bytes/Bulk Avg": "Bwd Avg Bytes/Bulk",
    "Bwd Packet/Bulk Avg": "Bwd Avg Packets/Bulk",
    "Bwd Bulk Rate Avg": "Bwd Avg Bulk Rate",
    "FWD Init Win Bytes": "Init_Win_bytes_forward",
    "Bwd Init Win Bytes": "Init_Win_bytes_backward",
    "Fwd Act Data Pkts": "act_data_pkt_fwd",
    "Fwd Seg Size Min": "min_seg_size_forward",
    "CWR Flag Count": "CWE Flag Count",
}

#: UNSW-NB15's ten families against ours. Only three correspond. The rest are
#: attacks Kairo was never trained to name — kept for the binary test, excluded
#: from the per-family one.
UNSW_LABELS = {
    0: "Normal",
    3: "DoS",
    7: "Port Scan",  # UNSW "Reconnaissance": sweeps and scans
    1: None,  # Analysis
    2: None,  # Backdoor
    4: None,  # Exploits
    5: None,  # Fuzzers
    6: None,  # Generic
    8: None,  # Shellcode
    9: None,  # Worms
}
UNSW_FAMILY = {
    0: "Benign", 1: "Analysis", 2: "Backdoor", 3: "DoS", 4: "Exploits",
    5: "Fuzzers", 6: "Generic", 7: "Reconnaissance", 8: "Shellcode", 9: "Worms",
}


def load_unsw() -> pd.DataFrame:
    """UNSW flows in CICIDS2017's column names, with both label views."""
    X = pd.read_csv(UNSW / "Data.csv", low_memory=False)
    y = pd.read_csv(UNSW / "Label.csv")["Label"]
    X = X.rename(columns=lambda c: RENAME.get(str(c).strip(), str(c).strip()))
    X = X.replace([np.inf, -np.inf], np.nan)
    keep = X.notna().all(axis=1)
    X, y = X[keep].reset_index(drop=True), y[keep].reset_index(drop=True)
    X["y"] = y.map(UNSW_LABELS)
    X["family"] = y.map(UNSW_FAMILY)
    return X


def run(per_class: int = 60_000, seed: int = 42) -> dict:
    art = joblib.load(ARTIFACTS / "model.joblib")
    unsw = load_unsw()
    shared = [f for f in art["features"] if f in unsw.columns]
    dropped = [f for f in art["features"] if f not in unsw.columns]
    print(f"unsw flows: {len(unsw):,}   shared features: {len(shared)}/{len(art['features'])}")
    if dropped:
        print(f"  not in the UNSW extraction: {', '.join(dropped)}")

    # The deployed model uses features UNSW does not carry, so the honest move
    # is to refit the same pipeline on the shared columns only. A model given
    # different inputs is a different model and gets its own baseline.
    cic = load_raw(per_class=per_class)
    present = [c for c in CLASSES if c in set(cic["y"])]
    codes = {c: i for i, c in enumerate(present)}
    Xc = cic[shared].to_numpy(dtype=np.float32)
    yc = cic["y"].map(codes).to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(
        Xc, yc, test_size=0.2, stratify=yc, random_state=seed
    )

    model = Pipeline([("scale", StandardScaler()), ("vote", art["model"].steps[-1][1])])
    model.fit(X_tr, y_tr)
    home = classification_report(
        y_te, model.predict(X_te), target_names=present, output_dict=True, zero_division=0
    )
    print(f"home (CICIDS2017, shared features): macro-F1 {home['macro avg']['f1-score']:.4f}")

    # ---- 1. per-family, on the three families both datasets contain --------
    known = unsw[unsw["y"].notna()].copy()
    Xk = known[shared].to_numpy(dtype=np.float32)
    pred = np.asarray(model.predict(Xk))
    truth = known["y"].map(codes).to_numpy()
    fam = classification_report(
        truth, pred, labels=[codes[c] for c in ("Normal", "DoS", "Port Scan")],
        target_names=["Normal", "DoS", "Port Scan"], output_dict=True, zero_division=0,
    )
    for c in ("Normal", "DoS", "Port Scan"):
        r = fam[c]
        print(f"  {c:<11} P {r['precision']:.3f}  R {r['recall']:.3f}  F1 {r['f1-score']:.3f}  n {int(r['support']):,}")

    # ---- 2. attack vs benign, on everything --------------------------------
    Xa = unsw[shared].to_numpy(dtype=np.float32)
    pa = np.asarray(model.predict(Xa))
    is_attack_true = (unsw["family"] != "Benign").to_numpy()
    normal_code = codes["Normal"]
    is_attack_pred = pa != normal_code
    tn, fp, fn, tp = confusion_matrix(is_attack_true, is_attack_pred, labels=[False, True]).ravel()
    binary = {
        # Counts as well as rates: the page prints "x of y flows", and a count
        # recovered from a rounded rate is a number nobody can check.
        "flows": int(len(pa)),
        "attacks": int(tp + fn),
        "flagged": int(tp + fp),
        "calledNormal": int(tn + fn),
        "caught": int(tp),
        "accuracy": round(float((tp + tn) / len(pa)), 4),
        "precision": round(float(tp / max(tp + fp, 1)), 4),
        "recall": round(float(tp / max(tp + fn, 1)), 4),
        "fpr": round(float(fp / max(fp + tn, 1)), 4),
        "fnr": round(float(fn / max(fn + tp, 1)), 4),
    }
    print(f"attack vs benign: recall {binary['recall']:.4f}  FPR {binary['fpr']:.4f}")

    # Per-family recall on the families it was never taught: how often an
    # unknown attack is at least flagged as not-normal.
    unseen = {}
    for f in sorted(set(unsw["family"]) - {"Benign", "DoS", "Reconnaissance"}):
        m = (unsw["family"] == f).to_numpy()
        if m.sum():
            unseen[f] = {
                "n": int(m.sum()),
                "caught": int((pa[m] != normal_code).sum()),
                "flagged": round(float((pa[m] != normal_code).mean()), 4),
            }
    for f, v in unseen.items():
        print(f"  unseen {f:<15} {v['flagged'] * 100:5.1f}% flagged  (n {v['n']:,})")

    out = {
        "trainedOn": f"CICIDS2017 - {len(cic):,} flows",
        "testedOn": f"UNSW-NB15 (CICFlowMeter re-extraction) - {len(unsw):,} flows",
        "sharedFeatures": len(shared),
        "modelFeatures": len(art["features"]),
        "droppedFeatures": dropped,
        "homeMacroF1": round(float(home["macro avg"]["f1-score"]), 4),
        "families": {
            c: {
                "precision": round(fam[c]["precision"], 4),
                "recall": round(fam[c]["recall"], 4),
                "f1": round(fam[c]["f1-score"], 4),
                "support": int(fam[c]["support"]),
            }
            for c in ("Normal", "DoS", "Port Scan")
        },
        "macroF1": round(float(fam["macro avg"]["f1-score"]), 4),
        "binary": binary,
        "unseenFamilies": unseen,
    }
    (ARTIFACTS / "generalization.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nwrote {ARTIFACTS / 'generalization.json'}")
    return out


if __name__ == "__main__":
    run()
