"""Loading and cleaning flows.

Two sources. `load_raw` reads the real CICIDS2017 CSVs once they are in
data/raw/. `synthetic` makes a dev set with the same column names and label
set so the pipeline is runnable and testable before the download happens —
the same honesty the console's FIXTURE badge shows: a model trained on
synthetic data says so in its metrics, and nothing pretends otherwise.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import LABEL_MAP, LEAKY, RAW, canon_label

LABEL_COL = "Label"

#: A readable subset of the CICIDS2017 feature set. The real loader keeps every
#: numeric column it finds; this list is only what the synthetic generator has
#: to invent, and it is the set the console already names in its detail pane.
SYNTHETIC_FEATURES = [
    "Destination Port",
    "Flow Duration",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Total Length of Fwd Packets",
    "Flow Bytes/s",
    "Flow Packets/s",
    "Fwd Packets/s",
    "Flow IAT Mean",
    "Flow IAT Std",
    "Fwd IAT Std",
    "Packet Length Std",
    "Average Packet Size",
    "Bwd Packet Length Mean",
    "Subflow Fwd Bytes",
    "Init_Win_bytes_forward",
    "SYN Flag Count",
    "ACK Flag Count",
    "act_data_pkt_fwd",
    "Down/Up Ratio",
]


def clean(df: pd.DataFrame, *, drop_constant: bool = True) -> pd.DataFrame:
    """Strip the header whitespace, drop identifiers, make the matrix finite.

    CICIDS2017's headers carry leading spaces and its Flow Bytes/s column
    carries infinities where a flow lasted zero microseconds. Both bite once,
    silently, and then show up as a model that will not converge.

    `drop_constant=False` is for the per-file load path: a column that is
    constant within Monday's capture is not constant across the week, and
    dropping it early would leave a ragged set of columns to concatenate.
    """
    df = df.rename(columns=lambda c: str(c).strip())
    df = df.drop(columns=[c for c in LEAKY if c in df.columns], errors="ignore")

    if LABEL_COL in df.columns:
        df[LABEL_COL] = df[LABEL_COL].map(canon_label)
        df["y"] = df[LABEL_COL].map(LABEL_MAP)
        # Unmapped labels (Heartbleed, Infiltration, the web XSS/SQL variants)
        # are dropped, not folded into Normal.
        df = df[df["y"].notna()].drop(columns=[LABEL_COL])

    num = df.select_dtypes(include=[np.number]).columns
    df[num] = df[num].replace([np.inf, -np.inf], np.nan)
    df = df.dropna(subset=num, how="any")
    if not drop_constant:
        return df
    # Constant columns carry no signal and slow every tree in the ensemble.
    return df.drop(columns=[c for c in num if df[c].nunique() <= 1], errors="ignore")


def cap(df: pd.DataFrame, n: int, seed: int = 42) -> pd.DataFrame:
    """At most `n` rows of each class, sampled without replacement."""
    parts = [g.sample(min(len(g), n), random_state=seed) for _, g in df.groupby("y")]
    return pd.concat(parts, ignore_index=True)


def load_raw(path=RAW, per_class: int | None = 60_000, seed: int = 42) -> pd.DataFrame:
    """Read every CSV in data/raw/ and return a cleaned, balanced-ish frame.

    `per_class` caps the majority classes. CICIDS2017 is 80% benign; left
    uncapped the ensemble learns to say Normal and score 80%.

    One file at a time, capped and downcast before the next one is read. The
    whole capture is 2.8M rows by 79 columns; concatenating it first and
    sampling afterwards needs several gigabytes and gets the process killed
    on an ordinary laptop, which is exactly what happened here.
    """
    files = sorted(path.glob("*.csv"))
    if not files:
        raise FileNotFoundError(
            f"No CSVs in {path}. Download CICIDS2017 (MachineLearningCSV.zip) "
            "from unb.ca/cic/datasets/ids-2017.html and unzip it there."
        )
    parts = []
    for f in files:
        # latin-1, not utf-8: the Web Attack labels carry a raw 0x96 byte and
        # a utf-8 read dies on it. canon_label sorts out the rest.
        d = clean(pd.read_csv(f, low_memory=False, encoding="latin-1"), drop_constant=False)
        d = d.drop_duplicates()
        if per_class:
            d = cap(d, per_class, seed)
        num = d.select_dtypes(include=[np.number]).columns
        d[num] = d[num].astype(np.float32)
        parts.append(d)

    df = pd.concat(parts, ignore_index=True).drop_duplicates()
    if per_class:
        df = cap(df, per_class, seed)
    num = df.select_dtypes(include=[np.number]).columns
    return df.drop(columns=[c for c in num if df[c].nunique() <= 1], errors="ignore")


def synthetic(n_per_class: int = 4_000, seed: int = 42) -> pd.DataFrame:
    """A dev set with CICIDS2017's column names and separable class structure.

    Each class gets its own mean vector and spread, drawn from what the attack
    actually does to a flow: a DDoS is short, enormous and one-directional; a
    port scan is a thousand tiny unanswered SYNs; brute force is a metronome.
    Botnet sits deliberately close to Normal — beaconing looks like traffic,
    which is why it is the hardest class on the real data too. The spreads are
    wide enough that a perfect score is not on offer; a pipeline bug shows up
    as a drop rather than hiding behind separable toy clusters.

    It exists to prove the pipeline runs, never to claim a score.
    """
    rng = np.random.default_rng(seed)
    k = len(SYNTHETIC_FEATURES)

    # (mean multiplier, spread) per class, in the column order above.
    profiles = {
        "Normal": ([80, 5e6, 20, 18, 1400, 9e3, 40, 20, 2e5, 9e4, 8e4, 240, 460, 420, 1400, 8192, 0.2, 14, 12, 1.0], 1.05),
        "DDoS": ([80, 9e4, 620, 6, 41000, 6.0e6, 4.2e3, 3.9e3, 400, 260, 240, 60, 90, 22, 41000, 512, 0.9, 4, 600, 0.05], 0.95),
        # DoS is DDoS's shape at one machine's scale: same starvation, far
        # fewer packets, connections held open instead of flooded.
        "DoS": ([80, 2.2e6, 180, 12, 9000, 2.4e5, 300, 280, 1.2e4, 8.0e3, 7.0e3, 120, 160, 60, 9000, 8192, 0.6, 10, 170, 0.1], 0.95),
        "Port Scan": ([9000, 6.0e3, 3, 1, 40, 9e3, 900, 820, 2.4e3, 700, 640, 18, 34, 2, 40, 1024, 0.95, 0.4, 2, 0.02], 1.0),
        "Brute Force": ([40, 2.8e6, 52, 48, 3800, 2.2e4, 48, 25, 6.0e4, 4.0e3, 3.4e3, 200, 380, 330, 3800, 16384, 0.28, 40, 34, 0.96], 0.95),
        # A web attack is a well-formed HTTP conversation carrying a payload
        # nobody asked for, so it sits close to Normal on flow shape alone.
        "Web Attack": ([80, 1.4e6, 34, 30, 2600, 1.6e4, 36, 19, 4.2e4, 2.6e4, 2.2e4, 210, 340, 300, 2600, 8192, 0.25, 26, 22, 0.9], 1.0),
        "Botnet": ([1100, 9.0e6, 28, 24, 2300, 4.0e3, 12, 6, 8.0e5, 4.5e4, 4.0e4, 190, 400, 360, 2300, 8192, 0.22, 22, 18, 0.92], 1.0),
    }

    frames = []
    for cls, (mu, spread) in profiles.items():
        base = np.asarray(mu, dtype=float)
        # lognormal noise: flow statistics are positive and heavy-tailed
        noise = rng.lognormal(0.0, spread, size=(n_per_class, k))
        x = base * noise
        x[:, SYNTHETIC_FEATURES.index("Destination Port")] = np.clip(
            x[:, SYNTHETIC_FEATURES.index("Destination Port")], 1, 65535
        ).round()
        f = pd.DataFrame(x, columns=SYNTHETIC_FEATURES)
        f["y"] = cls
        frames.append(f)

    return pd.concat(frames, ignore_index=True).sample(frac=1, random_state=seed).reset_index(drop=True)
