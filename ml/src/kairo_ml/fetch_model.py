"""Fetch the trained artifact at build time.

    PYTHONPATH=src KAIRO_MODEL_URL=https://... python -m kairo_ml.fetch_model

model.joblib is 43 MB and a retrain produces a new one, so it is gitignored and
the deploy downloads it instead. Anything that serves a plain URL works — a
public Hugging Face model repo (`.../resolve/main/model.joblib`), an S3 object,
a release asset. urllib is enough; a dependency to make one GET would be silly.

This exits non-zero when it cannot produce a usable model, which fails the
build. That is the point: a service that boots without a model answers 503 to
every request and looks like a model bug rather than a deploy bug.
"""

from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request

from .config import MODEL_PATH

#: Below this, the download is an error page or a Git LFS pointer, not a model.
#: The real artifact is ~43 MB; 1 MB is a floor, not an expectation.
MIN_BYTES = 1_000_000


def fetch(url: str, dest=MODEL_PATH) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # .part first: a half-written model.joblib that looks complete is worse
    # than no model at all, because load() will try to unpickle it.
    part = dest.with_suffix(".part")
    with urllib.request.urlopen(url, timeout=300) as r, part.open("wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    size = part.stat().st_size
    if size < MIN_BYTES:
        part.unlink()
        raise ValueError(f"{url} returned {size} bytes — not a model")
    part.replace(dest)
    return size


def main() -> int:
    # Present wins over configured: a Render disk or a warm build cache may
    # already have it, and re-downloading 43 MB per deploy buys nothing. Delete
    # the file to force a fetch.
    if MODEL_PATH.exists():
        print(f"model already present at {MODEL_PATH}, skipping download")
        return 0
    url = os.getenv("KAIRO_MODEL_URL", "").strip()
    if not url:
        print(
            "No model at artifacts/model.joblib and KAIRO_MODEL_URL is not set.\n"
            "Upload a trained model.joblib somewhere public and point this at it,\n"
            "or train in place with: PYTHONPATH=src python -m kairo_ml.cascade",
            file=sys.stderr,
        )
        return 1
    try:
        size = fetch(url)
    except (urllib.error.URLError, ValueError, OSError) as e:
        print(f"could not fetch the model: {e}", file=sys.stderr)
        return 1
    print(f"fetched {size / 1e6:.0f} MB -> {MODEL_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
