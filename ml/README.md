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
| `python -m kairo_ml.shift_analysis` | `shift_analysis.json` | Covariate drift (KS & Wasserstein) and threshold calibration |
| `python -m kairo_ml.multi_dataset` | `generalization_benchmark.json` | Multi-dataset cross-domain training (CICIDS2017 + UNSW-NB15) |
| `python -m kairo_ml.train [--synthetic]` | `model.joblib`, `metrics.json` | The voting ensemble on its own; `--synthetic` runs in a minute |
| `python -m kairo_ml.fetch_model` | `model.joblib` | Pulls a trained artifact from `KAIRO_MODEL_URL` — the deploy's build step |
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

## Cross-Dataset Generalization & Multi-Domain Training

Single-dataset intrusion detection models suffer from **covariate shift**: models memorise lab-specific network parameters (e.g., initial TCP window sizes, fixed timeout clocks) rather than invariant attack dynamics.

To evaluate and resolve this, `kairo_ml.multi_dataset` benchmarks three training paradigms on held-out evaluation sets across two distinct benchmark domains (CICIDS2017 and UNSW-NB15):

| Model Paradigm | Training Pool | CICIDS2017 Macro-F1 | UNSW-NB15 Macro-F1 | Harmonic Cross-Domain F1 | Training Time |
|---|---|:---:|:---:|:---:|:---:|
| **Model A: Single-Domain Baseline** | CICIDS2017 only (StandardScaler) | **0.9992** | 0.2037 *(collapsed)* | 0.3384 | 2.22 s |
| **Model B: Robust Outlier Scaling** | CICIDS2017 only (RobustScaler) | **0.9990** | 0.2036 | 0.3383 | 2.14 s |
| **Model C: Joint Multi-Dataset Fusion** | **CICIDS2017 + UNSW-NB15 pooled** | **0.9987** | **0.9215** *(+71.8%)* | **0.9586** | **4.00 s** |

### Key Empirical Findings:
1. **Single-Domain Overfitting:** Model A achieves 99.92% on its home dataset, but drops to 20.37% Macro-F1 (0% on Port Scan) on unseen UNSW traffic because of 17 high-drift features (e.g. `Init_Win_bytes_backward` with Kolmogorov-Smirnov $KS = 0.8666$).
2. **Multi-Domain Fusion Solves Cross-Dataset Failure:** Model C trained on pooled flows from both environments retains **99.87%** Macro-F1 on Canadian CICIDS2017 traffic while jumping to **92.15%** Macro-F1 on Australian UNSW-NB15 traffic (**0.9586 harmonic cross-domain F1**), completing training in **4.0 seconds**.
3. **Reproducibility:** Run `PYTHONPATH=src python -m kairo_ml.multi_dataset` to regenerate `artifacts/generalization_benchmark.json`.

## Deploy

`service.py` is the only thing that runs in production here: FastAPI, three
routes, authenticated via `KAIRO_ML_TOKEN` bearer tokens with explicit origin
restriction. Sits behind the Express API with mutual service-to-service validation.

```sh
PYTHONPATH=src uvicorn kairo_ml.service:app --port 8001   # 8000 is the API's
```

`GET /health` loads the model and says whether it is loadable, so a modelless
instance never passes Render's health check. `GET /model` is metrics.json.
`POST /predict` takes `{"flows": [...]}`, max 500, and returns one detection
per flow in the console's own shape.

The artifact is gitignored, so the deploy fetches it:
`python -m kairo_ml.fetch_model` downloads `KAIRO_MODEL_URL` to
`artifacts/model.joblib` and exits non-zero if it cannot. Set
`KAIRO_MODEL_SHA256` to the trusted artifact checksum; downloads and existing
artifacts are rejected when the checksum is absent or does not match. The
service also requires `KAIRO_ML_TOKEN` and an explicit `ALLOWED_ORIGINS` value.

The deployed cascade keeps the same seven classes, 30-feature input contract,
two-stage gate/namer inference, confidence, risk, severity, and evidence
output. Its tree counts are compacted to fit Render Free memory; this changes
only the internal model footprint, not the service contract or dashboard
features.

For the current compact checked-out `artifacts/model.joblib`, the SHA-256 checksum is:

```text
C4DFE073EA6F923C520B666371495BD03D263F66779D2C7D71FC6B7C488EE9B9
```

In Render, set the same randomly generated `KAIRO_ML_TOKEN` on both the
`kairo-api` and `kairo-ml` services. Set `ML_URL` on `kairo-api` to the ML
service URL, and set `KAIRO_MODEL_URL` plus the checksum above on `kairo-ml`.
rather than shipping a service that 503s. Any plain URL works — a Hugging Face
model repo, an S3 object, a release asset — and `KAIRO_MODEL_TOKEN` is sent as
a bearer token when set, so the repo does not have to be public.

Sizing, measured on this artifact: 43 MB pickle, **226 MB resident** once
loaded, 4s to unpickle, ~5ms per flow warm. One uvicorn worker per instance;
two do not fit in 512 MB.

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
