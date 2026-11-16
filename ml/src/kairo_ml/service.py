"""The inference service the Express API talks to.

Python stays on this side of the line: training, evaluation, inference. Every
other endpoint in the product is Express. Secured via KAIRO_ML_TOKEN bearer authentication
and explicit ALLOWED_ORIGINS CORS isolation. Dedicated service-to-service boundary.

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
from .config import ARTIFACTS, METRICS_PATH, MODEL_PATH
from .infer import load, predict
from .registry import get_registry

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
    allow_methods=["GET", "POST", "HEAD"],
    allow_headers=["*"],
)


@app.on_event("startup")
def preload_model() -> None:
    """Pre-warm model into cache during startup so health checks answer instantly."""
    try:
        load()
    except Exception:
        pass


@app.get("/")
@app.head("/")
def root() -> dict:
    """Render and health prober root endpoint."""
    return {"status": "ok", "service": "kairo-ml"}


class PredictRequest(BaseModel):
    flows: list[dict[str, Any]] = Field(..., min_length=1, max_length=500)


class PromoteRequest(BaseModel):
    version: str
    stage: str = Field(..., pattern="^(DEVELOPMENT|STAGING|CANARY|PRODUCTION|ARCHIVED)$")


class ValidateRequest(BaseModel):
    artifact_file: str = "model.joblib"


@app.get("/health")
@app.head("/health")
def health() -> dict:
    """Cheap and honest: reports whether a model is actually loadable."""
    try:
        art = load()
        prod = None
        try:
            reg = get_registry()
            prod = reg.get_production()
        except Exception:
            pass
        return {
            "ok": True,
            "model": art["metrics"]["tag"],
            "version": prod.get("version") if prod else "1.0.0",
            "sha256": prod.get("sha256") if prod else None,
            "classes": art["classes"],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/model", dependencies=[Depends(require_ml_auth)])
def model() -> dict:
    """The metrics the console's Model tab renders, straight from training."""
    if not METRICS_PATH.exists():
        raise HTTPException(503, "no model trained yet")
    data = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    reg = get_registry()
    data["registry"] = {
        "active_production": reg._data.get("active_production"),
        "canary_version": reg._data.get("canary_version"),
        "previous_production": reg._data.get("previous_production"),
    }
    return data


@app.get("/registry/models", dependencies=[Depends(require_ml_auth)])
def list_registry_models() -> dict:
    """List all registered models and lifecycle stages."""
    reg = get_registry()
    return {
        "active_production": reg._data.get("active_production"),
        "canary_version": reg._data.get("canary_version"),
        "models": reg.list_models(),
    }


@app.post("/registry/validate", dependencies=[Depends(require_ml_auth)])
def validate_candidate_endpoint(req: ValidateRequest) -> dict:
    """Run automated validation gate against a candidate model artifact."""
    reg = get_registry()
    artifact_path = ARTIFACTS / req.artifact_file
    result = reg.validate_candidate(artifact_path)
    if not result.get("overall_valid", False):
        raise HTTPException(422, detail=result)
    return {"ok": True, "validation": result}


@app.post("/registry/promote", dependencies=[Depends(require_ml_auth)])
def promote_model_endpoint(req: PromoteRequest) -> dict:
    """Promote a registered model version to CANARY or PRODUCTION."""
    reg = get_registry()
    try:
        updated = reg.promote(req.version, req.stage)
        return {"ok": True, "model": updated}
    except (KeyError, ValueError) as e:
        raise HTTPException(400, detail=str(e)) from e


@app.post("/registry/rollback", dependencies=[Depends(require_ml_auth)])
def rollback_model_endpoint() -> dict:
    """Atomic rollback of PRODUCTION to the previous stable release."""
    reg = get_registry()
    try:
        result = reg.rollback()
        return {"ok": True, "rollback": result}
    except RuntimeError as e:
        raise HTTPException(409, detail=str(e)) from e


@app.post("/predict", dependencies=[Depends(require_ml_auth)])
def predict_route(req: PredictRequest) -> dict:
    try:
        return {"detections": predict(req.flows)}
    except FileNotFoundError as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        # a malformed flow is the caller's bug, not a server fault
        raise HTTPException(422, str(e)) from e
