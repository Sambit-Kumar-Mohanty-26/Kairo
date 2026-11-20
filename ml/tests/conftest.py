import os
import sys
import tempfile
from pathlib import Path

# Ensure src is on path and test artifacts dir is isolated before any tests import kairo_ml
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
os.environ.setdefault("KAIRO_ARTIFACTS", tempfile.mkdtemp(prefix="kairo-test-"))
os.environ.setdefault("KAIRO_ML_TOKEN", "test-token")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
