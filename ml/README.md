# kairo-ml

Everything the landing page claims about the model is produced here. If a
number appears in `frontend/src/components/sections/` and cannot be traced to
a file in `artifacts/`, it is a bug.

## Setup

```sh
pip install -r requirements.txt
export PYTHONPATH=src          # every command below needs it
```

`python -m kairo_ml.x` without `PYTHONPATH=src` fails with
`ModuleNotFoundError: No module named 'kairo_ml'`.

Two environment overrides exist so a test can never overwrite a real model and
a deploy can mount the artifact elsewhere: `KAIRO_DATA`, `KAIRO_ARTIFACTS`.

## Data

`data/raw/` — CICIDS2017's `MachineLearningCSV` files, eight CSVs, 2,830,743
rows. The canonical download at unb.ca is gated behind a form; the
`c01dsnap/CIC-IDS2017` mirror on Hugging Face is ungated and its per-label
counts match the published ones exactly, which is why it is what we used.

`data/unsw/` — `Data.csv` + `Label.csv` from `bencorn/CIC-UNSW-NB15`: the
UNSW-NB15 pcaps re-extracted with CICFlowMeter, so the feature space is
comparable to CICIDS2017 rather than merely adjacent. 447,915 flows.

Read with `encoding="latin-1"`. Thursday's file carries a raw `0x96` byte in
the Web Attack labels, and every mirror mangles it differently — one turns it
into U+FFFD. `canon_label` in `config.py` normalises all of them, which is why
`LABEL_MAP` keys are plain ASCII.

## Commands

| Command | Writes | What it is |
|---|---|---|
| `python -m kairo_ml.benchmark` | `benchmark.json`, `selection.json`, `model.joblib` | Seven flat models on one split — section 03's table |
| `python -m kairo_ml.cascade` | `benchmark.json` (+1 row), `model.joblib`, `metrics.json` | The two-stage gate/namer, and the deploy |
| `python -m kairo_ml.selection` | `tells.json` | Per-class one-vs-rest MI — section 03's chips |
| `python -m kairo_ml.generalize` | `generalization.json` | UNSW-NB15, no retraining — section 07 |
| `python -m kairo_ml.train [--synthetic]` | `model.joblib`, `metrics.json` | The voting ensemble on its own; `--synthetic` runs in a minute |
| `python tests/test_pipeline.py` | — | Eight checks over the whole path |

Order matters once: `cascade` reads `benchmark.json` for the feature list and
asserts its split matches, so run `benchmark` first on a fresh checkout.

Full run on this laptop: benchmark ~9 min, cascade ~6 min, generalize ~10 min,
mostly spent loading 2.8M rows. `load_raw` reads one file at a time and caps
each class at 60k before the next is opened — concatenating first needs
several gigabytes and gets the process killed.

## What is deployed, and why it is not the best row

`benchmark.json` has two keys. `best` is the highest macro-F1: the flat
stacking ensemble, 0.9948. `deployed` is the two-stage cascade, 0.9945.

They are not the same on purpose. Bootstrapping the test split a thousand
times puts the gap at −0.00034 with a 95% interval of [−0.00131, +0.00057] —
straddling zero, because macro-F1 averages a class with 389 test rows. Two
models inside each other's noise get chosen on architecture, and the cascade
gates every flow with one cheap binary model and only pays for the naming
ensemble on what passes. The landing page prints both rows and the interval.

## Contracts that will break quietly

- `WEIGHTS` in `train.py` ↔ `ENSEMBLE` in `frontend/src/lib/demo.ts`. The
  console draws the naming stage's fitted stacking weights, not these; change
  one and reconcile the other by hand.
- `risk_of()` in `config.py` ↔ every `PROFILES` risk in `demo.ts`. Each
  fixture risk is exactly `RISK_CEILING[cls] * confidence`, rounded.
  `test_risk_matches_the_console_fixtures` pins two of them.
- `CLASSES` in `config.py` ↔ `SCENARIOS` in `demo.ts`. Seven, in the same
  order. DoS is never folded into DDoS.
- Every `{ name, weight }` in `demo.ts` ↔ `selected` in `selection.json`.
  A profile may only name a feature the model was trained on;
  `test_console_only_names_features_the_model_has` enforces it, and it caught
  two dropped columns on screen.
- `artifacts/*.json` ↔ the numbers in `DetectionSection.tsx`,
  `ResearchSection.tsx` and `demo.ts`. Retrain and these go stale silently;
  the JSON is the source of truth in every case.
