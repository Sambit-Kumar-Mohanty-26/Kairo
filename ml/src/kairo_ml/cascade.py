"""The two-stage cascade the landing page draws: gate, then name.

Section 03 says "every flow is first asked only whether it is malicious; only
what survives is given a name", and the canvas animates exactly that. Until
this file existed the trained model was a single flat seven-way classifier,
which made the picture a description of an intention rather than of the
pipeline. So the cascade is built here and scored on the same held-out split
as every other candidate — and then deployed, because a picture of an
architecture is a claim about the architecture. It is not the table's top row:
the flat stacking ensemble scores 0.0003 higher and the page says so.

    PYTHONPATH=src python -m kairo_ml.cascade

Reuses the benchmark's split (same loader, same features, same seed), so the
row it appends to artifacts/benchmark.json is comparable to the rows already
there rather than merely similar.
"""

from __future__ import annotations

import json
import time

import joblib
import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import f1_score
from xgboost import XGBClassifier

from .benchmark import score
from .config import ARTIFACTS, CLASSES, METRICS_PATH, MODEL_PATH
from .data import load_raw

NAME = "Two-Stage Cascade"


def _xgb(seed: int, **kw) -> XGBClassifier:
    return XGBClassifier(
        n_estimators=400,
        max_depth=8,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        tree_method="hist",
        n_jobs=-1,
        random_state=seed,
        **kw,
    )


def _namer(kind: str, seed: int):
    """Gate 02. XGBoost alone, or the ensemble that won the flat table.

    Worth the choice: the gate is a cheap binary question and the namer is
    where the difficulty is, so the two stages have no reason to be the same
    model. Both are measured; `--namer` picks which row gets printed.
    """
    if kind == "xgb":
        return _xgb(seed)
    return StackingClassifier(
        estimators=[
            (
                "Random Forest",
                RandomForestClassifier(
                    n_estimators=300, n_jobs=-1, class_weight="balanced", random_state=seed
                ),
            ),
            (
                "Extra Trees",
                ExtraTreesClassifier(
                    n_estimators=300,
                    criterion="entropy",
                    n_jobs=-1,
                    class_weight="balanced",
                    random_state=seed,
                ),
            ),
            ("XGBoost", _xgb(seed)),
        ],
        final_estimator=LogisticRegression(max_iter=1000, class_weight="balanced"),
        cv=3,
        n_jobs=None,
    )


class Cascade(BaseEstimator, ClassifierMixin):
    """Gate 01 decides malicious or not. Gate 02 names what survived.

    The output is still a seven-way probability vector, so everything
    downstream — risk_of, the evidence pane, the service contract — is
    untouched: P(Normal) is the gate's benign probability, and every attack
    class is the gate's malicious probability times the namer's share of it.

    Why it can beat a flat model on the rare classes: the namer never sees a
    benign flow, so Botnet is 1 in 74 of its training set instead of 1 in 130,
    and it spends all of its capacity on the distinctions that are hard.
    """

    #: Gate 01's cut. 0.5 and not tuned: a threshold fitted on the test split
    #: is the test split's threshold, and moving it is a product decision
    #: about how much noise an operator will read, not a modelling one.
    THRESHOLD = 0.5

    def __init__(self, seed: int = 42, normal: int = 0, namer: str = "stack"):
        self.seed = seed
        self.normal = normal
        self.namer = namer

    def fit(self, X, y):
        y = np.asarray(y)
        self.classes_ = np.unique(y)
        attack = y != self.normal
        self.gate_ = _xgb(self.seed).fit(X, attack.astype(int))
        # The namer works in its own dense label space; XGBoost will not
        # accept the gappy original codes.
        self.attack_classes_ = np.array([c for c in self.classes_ if c != self.normal])
        remap = {c: i for i, c in enumerate(self.attack_classes_)}
        self.namer_ = _namer(self.namer, self.seed).fit(
            X[attack], np.array([remap[c] for c in y[attack]])
        )
        return self

    def predict_proba(self, X):
        """Gate everything, name only the survivors.

        The naming stage runs on the rows that passed gate 01 and on no
        others — which is the whole point of the shape, and where the work
        is saved: on traffic that is mostly benign, the expensive ensemble
        sees a small minority of the flows.

        A rejected flow keeps its benign probability and its attack mass is
        left spread, never attributed: the cascade does not name what it
        did not send to the namer.
        """
        p_attack = self.gate_.predict_proba(X)[:, 1]
        passed = p_attack > self.THRESHOLD
        out = np.empty((len(X), len(self.classes_)), dtype=np.float64)
        out[:, self.normal] = 1.0 - p_attack
        cols = [list(self.classes_).index(c) for c in self.attack_classes_]
        out[:, cols] = (p_attack / len(cols))[:, None]
        if passed.any():
            share = self.namer_.predict_proba(X[passed])
            out[np.ix_(passed, cols)] = share * p_attack[passed][:, None]
        return out

    def predict(self, X):
        return self.classes_[np.argmax(self.predict_proba(X), axis=1)]

    @property
    def feature_importances_(self) -> np.ndarray:
        """Both stages, averaged — what _evidence weights its z-scores by.

        A stacking namer has no importances of its own, so its members'
        are averaged first; a logistic meta-learner is a reweighting of the
        same three trees, not a different view of the features.
        """
        fi = getattr(self.namer_, "feature_importances_", None)
        if fi is None:
            members = [e.feature_importances_ for _, e in self.namer_.named_estimators_.items()]
            fi = np.mean(members, axis=0)
        return (self.gate_.feature_importances_ + np.asarray(fi)) / 2.0


def _latency(model, X, rounds: int = 3) -> float:
    """Median microseconds to score one flow, over three passes of 10k."""
    X = X[:10_000]
    took = [_one_pass(model, X) for _ in range(rounds)]
    return round(float(np.median(took)), 1)


def _one_pass(model, X) -> float:
    t = time.time()
    model.predict(X)
    return (time.time() - t) * 1e6 / len(X)


def _bootstrap(y_true, preds: dict, n: int = 1000, seed: int = 42) -> dict:
    """Resample the test set and report each model's macro-F1 interval.

    Two models four ten-thousandths apart on 50,648 rows are not obviously
    different models: macro-F1 averages seven classes, the smallest of which
    has 389 rows, so one flow moves the average by about two ten-thousandths.
    Rather than argue that from arithmetic, resample the split and look at
    whether the intervals overlap — and at how often each model actually
    comes out ahead, which is the question a deployment decision turns on.
    """
    rng = np.random.default_rng(seed)
    names = list(preds)
    draws = {k: [] for k in names}
    for _ in range(n):
        idx = rng.integers(0, len(y_true), len(y_true))
        for k in names:
            draws[k].append(f1_score(y_true[idx], preds[k][idx], average="macro"))
    out = {
        k: {
            "mean": round(float(np.mean(v)), 4),
            "ci95": [round(float(np.percentile(v, 2.5)), 4), round(float(np.percentile(v, 97.5)), 4)],
        }
        for k, v in draws.items()
    }
    a, b = names[0], names[1]
    diff = np.asarray(draws[a]) - np.asarray(draws[b])
    out["diff"] = {
        "of": [a, b],
        "mean": round(float(diff.mean()), 5),
        "ci95": [round(float(np.percentile(diff, 2.5)), 5), round(float(np.percentile(diff, 97.5)), 5)],
        "aheadShare": round(float((diff > 0).mean()), 3),
    }
    return out


def run(per_class: int = 60_000, seed: int = 42, namer: str = "stack") -> dict:
    bench = json.loads((ARTIFACTS / "benchmark.json").read_text(encoding="utf-8"))
    features = bench["features"]

    df = load_raw(per_class=per_class)
    present = [c for c in CLASSES if c in set(df["y"])]
    codes = {c: i for i, c in enumerate(present)}
    X = df[features].to_numpy(dtype=np.float32)
    y = df["y"].map(codes).to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)
    assert len(X_te) == bench["testRows"], "split drifted from the benchmark's"

    pipe = Pipeline(
        [("scale", StandardScaler()), ("cascade", Cascade(seed, codes["Normal"], namer))]
    )
    t0 = time.time()
    pipe.fit(X_tr, y_tr)
    took = time.time() - t0
    pred = pipe.predict(X_te)
    row = score(y_te, pred, present) | {
        "name": NAME,
        "seconds": round(took, 1),
        "note": f"gate + {'stacking' if namer == 'stack' else 'XGBoost'} namer",
        "trainRows": int(len(X_tr)),
    }
    print(f"  {NAME:<20} acc {row['accuracy']:.4f}  macroF1 {row['macroF1']:.4f}  ({took:.0f}s)")

    # What the shape costs and what it buys, measured on the same rows and
    # before the incumbent is overwritten.
    gate_p = pipe.named_steps["cascade"].gate_.predict_proba(
        pipe.named_steps["scale"].transform(X_te)
    )[:, 1]
    row["namedShare"] = round(float((gate_p > Cascade.THRESHOLD).mean()), 4)
    row["latencyUsPerFlow"] = _latency(pipe, X_te)

    champion = max(
        (m for m in bench["models"] if m["name"] != NAME), key=lambda m: m["macroF1"]
    )
    if MODEL_PATH.exists():
        incumbent = joblib.load(MODEL_PATH)["model"]
        row["incumbentLatencyUsPerFlow"] = _latency(incumbent, X_te)
        row["vsIncumbent"] = _bootstrap(y_te, {NAME: pred, champion["name"]: incumbent.predict(X_te)})
        d = row["vsIncumbent"]["diff"]
        print(f"  {row['latencyUsPerFlow']}us/flow vs {row['incumbentLatencyUsPerFlow']}us "
              f"· names {row['namedShare'] * 100:.0f}% of the split")
        print(f"  macro-F1 vs {champion['name']}: {d['mean']:+.5f} "
              f"[{d['ci95'][0]:+.5f}, {d['ci95'][1]:+.5f}], ahead in {d['aheadShare'] * 100:.0f}% of resamples")

    bench["models"] = [m for m in bench["models"] if m["name"] != NAME] + [row]
    bench["best"] = max(bench["models"], key=lambda m: m["macroF1"])["name"]

    # `best` is the highest macro-F1 in the table. `deployed` is the cascade,
    # and they are not the same row. The flat stacking ensemble scores 0.0003
    # higher, which resampling the split puts inside the noise, and it has to
    # run every member on every flow; the cascade names only what its gate
    # passes. Both rows stay in the table and the page prints the gap. What
    # would not be defensible is drawing the cascade and shipping the other
    # one, or quoting the better score next to the cheaper architecture.
    bench["deployed"] = NAME
    (ARTIFACTS / "benchmark.json").write_text(json.dumps(bench, indent=2), encoding="utf-8")

    metrics = {
        "tag": "v1.0-cascade",
        "trainedAt": bench["trainedAt"],
        "dataset": bench["dataset"],
        "accuracy": row["accuracy"],
        "macroF1": row["macroF1"],
        "trainSeconds": row["seconds"],
        "deployed": NAME,
        "classes": row["perClass"],
    }
    joblib.dump(
        {"model": pipe, "features": features, "classes": present, "metrics": metrics},
        MODEL_PATH,
    )
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"\ndeployed {NAME} -> {MODEL_PATH}")
    return row


if __name__ == "__main__":
    import argparse

    # Run the package's copy of this module, not __main__'s. `python -m` makes
    # this file __main__, and a Cascade pickled from here records itself as
    # __main__.Cascade — an artifact that only loads back under `python -m`.
    from kairo_ml import cascade

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--namer", choices=("stack", "xgb"), default="stack")
    cascade.run(namer=ap.parse_args().namer)
