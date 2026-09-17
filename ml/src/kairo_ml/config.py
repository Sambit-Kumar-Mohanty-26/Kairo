"""Paths, the label map, and the one mapping the console depends on.

The console (frontend/src/lib/demo.ts) currently fakes all of this. When the
service is wired up, these are the definitions that replace the fixtures, so
the class names and the risk scale must stay in step with `Scenario` and
`CRITICAL_AT` over there.
"""

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(os.getenv("KAIRO_DATA", ROOT / "data" / "raw"))
#: Overridable so a test never overwrites a real model, and so a deploy can
#: mount the artifact somewhere other than the source tree.
ARTIFACTS = Path(os.getenv("KAIRO_ARTIFACTS", ROOT / "artifacts"))
MODEL_PATH = ARTIFACTS / "model.joblib"
METRICS_PATH = ARTIFACTS / "metrics.json"

#: The seven classes the product speaks in. Order is fixed — it is the order
#: metrics and probabilities are reported in.
#:
#: DoS is its own class, not folded into DDoS. The landing page makes a point
#: of this ("we never collapse the two into one label") and it is the right
#: call: they differ only in source cardinality, so a model that is allowed to
#: merge them never has to learn the one feature that separates them.
CLASSES = ["Normal", "DDoS", "DoS", "Port Scan", "Brute Force", "Web Attack", "Botnet"]

#: CICIDS2017 ships more labels than we classify. Anything unmapped is dropped
#: rather than lumped into Normal, which would teach the model that attacks it
#: has never been shown look benign.
#:
#: The three "Web Attack" labels stay together as the dataset groups them,
#: including its brute-force variant — that one is credential stuffing over
#: HTTP, which shares far more with XSS and SQLi in flow shape than it does
#: with an SSH patator.
LABEL_MAP = {
    "BENIGN": "Normal",
    "DDoS": "DDoS",
    "DoS Hulk": "DoS",
    "DoS GoldenEye": "DoS",
    "DoS slowloris": "DoS",
    "DoS Slowhttptest": "DoS",
    "PortScan": "Port Scan",
    "FTP-Patator": "Brute Force",
    "SSH-Patator": "Brute Force",
    "Web Attack - Brute Force": "Web Attack",
    "Web Attack - XSS": "Web Attack",
    "Web Attack - Sql Injection": "Web Attack",
    "Bot": "Botnet",
}
#: The Web Attack labels ship with a 0x96 byte where a dash belongs, and
#: every re-encoding of the file mangles it differently — one mirror turns it
#: into a U+FFFD replacement character. Matching on the exact bytes is a trap,
#: so labels are canonicalised before lookup and the keys above are ASCII.
_ODD = re.compile(r"[^ -~]+")


def canon_label(s: str) -> str:
    """Normalise a label: odd bytes become a dash, runs of space collapse."""
    return re.sub(r"\s+", " ", _ODD.sub("-", str(s))).strip()


#: Heartbleed (11 rows) and Infiltration (36) are dropped: too few flows to
#: learn from, and too few to honestly report a per-class score on.

#: Risk is not a model output — it is a policy on top of one. Each class has a
#: ceiling, and confidence scales it: risk = round(ceiling * confidence).
#: CRITICAL_AT in the console is 88, so a confident DDoS, Brute Force, Web
#: Attack or Botnet clears it and a Port Scan does not.
RISK_CEILING = {
    "Normal": 12,
    "DDoS": 92,
    "DoS": 86,
    "Port Scan": 80,
    "Brute Force": 88,
    "Web Attack": 90,
    "Botnet": 91,
}

#: Columns that identify a flow rather than describe it. Training on these
#: teaches the model the capture session, not the attack.
LEAKY = ["Flow ID", "Source IP", "Destination IP", "Source Port", "Timestamp", "Fwd Header Length.1"]


def risk_of(cls: str, confidence: float) -> int:
    """Risk 0-100 for a verdict. Same formula the console will display."""
    return round(RISK_CEILING[cls] * confidence)
