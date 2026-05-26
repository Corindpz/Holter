import json
import sys
from functools import lru_cache
from pathlib import Path

_DEFAULTS = {
    "port": 8765,
    "db_path": "./holter.db",
    "ollama_url": "http://localhost:11434",
    "model_override": None,
    "confidence_threshold_clos": 0.85,
    "confidence_threshold_escalate": 0.70,
    "chroma_path": "./chroma_db",
    "regulatory_path": "./regulatory",
}


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        # Running inside PyInstaller exe — settings.json lives next to the exe
        return Path(sys.executable).parent
    # Dev mode — settings.json at project root (parent of src/)
    return Path(__file__).parent.parent


@lru_cache(maxsize=1)
def get_settings() -> dict:
    path = _base_dir() / "settings.json"
    if not path.exists():
        return dict(_DEFAULTS)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {**_DEFAULTS, **data}
    except json.JSONDecodeError:
        return dict(_DEFAULTS)
