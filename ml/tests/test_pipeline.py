"""One runnable check over the whole path: generate, train, save, predict.

    python tests/test_pipeline.py     (or: pytest ml/tests)

Deliberately small — a few hundred rows per class, seconds to run. It is not
measuring model quality; it fails when the pipeline is broken.
"""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
# Before importing the package: the check trains its own throwaway model and
# must never overwrite the one in artifacts/.
os.environ.setdefault("KAIRO_ARTIFACTS", tempfile.mkdtemp(prefix="kairo-test-"))

from kairo_ml.config import CLASSES, LABEL_MAP, canon_label, risk_of  # noqa: E402
from kairo_ml.data import cap, clean, synthetic  # noqa: E402
from kairo_ml.infer import load, predict, predict_one, severity_of  # noqa: E402
from kairo_ml.train import train  # noqa: E402


def test_clean_drops_infinities_and_unmapped_labels():
    import numpy as np
    import pandas as pd

    df = pd.DataFrame(
        {
            " Flow Bytes/s ": [1.0, np.inf, 3.0, 4.0],
            "Constant": [7, 7, 7, 7],
            "Source IP": ["a", "b", "c", "d"],
            "Label": ["BENIGN", "BENIGN", "Heartbleed", "DDoS"],
        }
    )
    out = clean(df)
    assert "Flow Bytes/s" in out.columns, "header whitespace not stripped"
    assert "Source IP" not in out.columns, "identifier column kept"
    assert "Constant" not in out.columns, "constant column kept"
    # row 1 is infinite, row 2 is an unmapped label — both go
    assert list(out["y"]) == ["Normal", "DDoS"]


def test_web_attack_labels_survive_any_encoding():
    # The real CSVs carry a raw 0x96 where a dash belongs, and every mirror
    # mangles it differently. All four spellings must reach one class.
    for sep in ("\x96", "�", "–", "ï¿½"):
        got = LABEL_MAP.get(canon_label(f"Web Attack {sep} XSS"))
        assert got == "Web Attack", f"{sep!r} mapped to {got}"
    assert LABEL_MAP[canon_label("  BENIGN ")] == "Normal"


def test_cap_balances_without_inventing_rows():
    import pandas as pd

    df = pd.DataFrame({"f": range(100), "y": ["Normal"] * 90 + ["Botnet"] * 10})
    out = cap(df, 20)
    assert out["y"].value_counts().to_dict() == {"Normal": 20, "Botnet": 10}
    assert out["f"].is_unique, "sampled with replacement"


def test_train_and_predict_round_trip():
    df = synthetic(n_per_class=500, seed=7)
    m = train(df, tag="v0-test", dataset="unit test")

    assert m["accuracy"] > 0.85, f"pipeline degraded: {m['accuracy']}"
    assert {c["cls"] for c in m["classes"]} == set(CLASSES)

    load.cache_clear()
    art = load()
    flow = {f: float(v) for f, v in zip(art["features"], df.iloc[0][art["features"]])}
    d = predict_one(flow)

    assert d["attack"] in CLASSES
    assert 0.0 <= d["confidence"] <= 1.0
    assert d["risk"] == risk_of(d["attack"], d["confidence"])
    assert 0 <= d["risk"] <= 100
    assert d["severity"] == severity_of(d["risk"])
    assert len(d["features"]) == 5, "evidence should name five features"
    assert all(f["name"] in art["features"] for f in d["features"])

    assert len(predict([flow, flow])) == 2, "batching broken"


def test_missing_feature_is_rejected_not_defaulted():
    load.cache_clear()
    art = load()
    flow = {f: 1.0 for f in art["features"]}
    flow.pop(art["features"][0])
    try:
        predict_one(flow)
    except ValueError as e:
        assert art["features"][0] in str(e)
    else:
        raise AssertionError("a flow missing a feature must not be scored")


def test_risk_matches_the_console_fixtures():
    # frontend/src/lib/demo.ts shows DDoS 98.4% -> risk 91 and Normal -> 12
    assert risk_of("DDoS", 0.984) == 91
    assert risk_of("Normal", 0.981) == 12
    assert severity_of(risk_of("DDoS", 0.984)) == "critical"
    assert severity_of(risk_of("Port Scan", 0.967)) == "warning"


def test_cascade_gate_refuses_to_name_what_it_rejects():
    import numpy as np

    from kairo_ml.cascade import Cascade

    df = synthetic(n_per_class=300, seed=11)
    feats = [c for c in df.columns if c != "y"]
    codes = {c: i for i, c in enumerate(CLASSES)}
    X = df[feats].to_numpy(dtype=np.float32)
    y = df["y"].map(codes).to_numpy()
    c = Cascade(seed=11, normal=codes["Normal"], namer="xgb").fit(X, y)

    p = c.predict_proba(X)
    assert np.allclose(p.sum(axis=1), 1.0), "probabilities must still be a distribution"
    # A flow the gate calls benign must come out Normal: the namer never saw it.
    benign = c.gate_.predict_proba(X)[:, 1] <= Cascade.THRESHOLD
    assert (c.predict(X)[benign] == codes["Normal"]).all(), "named a flow the gate rejected"
    assert len(c.feature_importances_) == len(feats)


def test_console_only_names_features_the_model_has():
    """Every feature in demo.ts must be one selection kept.

    The console's evidence pane and its importance panel print feature names
    as if the model weighed them. It is a cross-language contract with nothing
    to enforce it, and it has been wrong: `Average Packet Size` and
    `Total Backward Packets` were dropped by correlation pruning and the
    variance floor respectively, and were still on screen.
    """
    import json
    import re

    sel = Path(__file__).resolve().parents[1] / "artifacts" / "selection.json"
    if not sel.exists():
        return  # fresh checkout, nothing selected yet
    kept = set(json.loads(sel.read_text(encoding="utf-8"))["selected"])
    demo = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "demo.ts"
    # `weight: n }` and not `weight: n, note:` — the latter is ENSEMBLE, whose
    # names are models, not features.
    named = set(
        re.findall(r'\{ name: "([^"]+)", weight: [\d.]+ \}', demo.read_text(encoding="utf-8"))
    )
    assert named, "no feature names found — did demo.ts change shape?"
    assert not named - kept, f"console names features the model never saw: {sorted(named - kept)}"


def test_agent_emits_exactly_the_selected_features():
    """agent/flow.py computes the model's input. It must be the same 30 names.

    The agent is in a third language with no shared type: if selection.json
    changes and flow.py does not, /predict rejects every batch a sensor sends —
    the fleet goes quiet and nothing says why. One missing name here is a
    site-wide outage, which is why this is a test and not a comment.
    """
    import json
    import re

    sel = Path(__file__).resolve().parents[1] / "artifacts" / "selection.json"
    if not sel.exists():
        return  # fresh checkout, nothing selected yet
    kept = json.loads(sel.read_text(encoding="utf-8"))["selected"]

    flow = Path(__file__).resolve().parents[2] / "agent" / "flow.py"
    block = re.search(r"FEATURES\s*=\s*\(?\[(.*?)\]", flow.read_text(encoding="utf-8"), re.S)
    assert block, "FEATURES not found — did agent/flow.py change shape?"
    emitted = re.findall(r'"([^"]+)"', block.group(1))

    assert set(emitted) == set(kept), (
        f"agent missing {sorted(set(kept) - set(emitted))}, "
        f"extra {sorted(set(emitted) - set(kept))}"
    )
    # Order too: the service builds its matrix from the selection order, and a
    # dict that happens to iterate differently is a silent column swap.
    assert emitted == kept, "agent's FEATURES are in a different order"


if __name__ == "__main__":
    # definition order, not alphabetical — the later checks need the model the
    # round-trip check trains
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
    print("\nall checks passed")
