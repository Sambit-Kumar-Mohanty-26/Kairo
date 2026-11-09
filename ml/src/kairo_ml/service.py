"""The inference service the Express API talks to.

Python stays on this side of the line: training, evaluation, inference. Every
other endpoint in the product is Express. This service holds no database and
no auth of its own — it sits behind the API, which already has both.

    uvicorn kairo_ml.service:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
import secrets
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from . import __version__
from .config import METRICS_PATH
from .infer import load, predict

app = FastAPI(title="Kairo ML", version=__version__)
ML_TOKEN = os.getenv("KAIRO_ML_TOKEN", "").strip()
if not ML_TOKEN:
    raise RuntimeError("KAIRO_ML_TOKEN must be configured before starting the ML service.")
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if not allowed_origins:
    raise RuntimeError("ALLOWED_ORIGINS must contain at least one explicit origin.")
bearer = HTTPBearer(auto_error=False)


def require_ml_auth(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
    if not credentials or credentials.scheme.lower() != "bearer" or not secrets.compare_digest(
        credentials.credentials, ML_TOKEN
    ):
        raise HTTPException(status_code=401, detail="ML service authentication required.")

# Only the API should reach this. In production that is one origin, not "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    flows: list[dict[str, Any]] = Field(..., min_length=1, max_length=500)


@app.get("/health")
def health() -> dict:
    """Cheap and honest: reports whether a model is actually loadable."""
    try:
        art = load()
        return {"ok": True, "model": art["metrics"]["tag"], "classes": art["classes"]}
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}


@app.get("/model", dependencies=[Depends(require_ml_auth)])
def model() -> dict:
    """The metrics the console's Model tab renders, straight from training."""
    if not METRICS_PATH.exists():
        raise HTTPException(503, "no model trained yet")
    return json.loads(METRICS_PATH.read_text(encoding="utf-8"))


@app.post("/predict", dependencies=[Depends(require_ml_auth)])
def predict_route(req: PredictRequest) -> dict:
    try:
        return {"detections": predict(req.flows)}
    except FileNotFoundError as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        # a malformed flow is the caller's bug, not a server fault
        raise HTTPException(422, str(e)) from e
