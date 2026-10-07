"""Optional Core ML audio-classifier adapter.

Dozi does not bundle a third-party classifier or silently download one.  When
the owner installs an approved Core ML model and points
``DOZI_COREML_AUDIO_CLASSIFIER`` to it, this adapter can route lightweight
audio tagging/classification to Core ML with ``ComputeUnit.ALL`` (which lets
macOS select the Neural Engine where the model supports it).  The rest of the
application continues to work when no classifier is configured.
"""

from __future__ import annotations

from functools import lru_cache
import importlib.util
import os
from pathlib import Path
import platform
from typing import Any

import numpy as np


def _is_supported_host() -> bool:
    return platform.system() == "Darwin" and platform.machine().lower() in {"arm64", "aarch64"}


def _configured_model() -> Path | None:
    value = os.getenv("DOZI_COREML_AUDIO_CLASSIFIER", "").strip()
    return Path(value).expanduser() if value else None


def classifier_status() -> dict[str, Any]:
    """Report readiness without loading model weights or exposing local paths."""
    model = _configured_model()
    supported = _is_supported_host()
    package = importlib.util.find_spec("coremltools") is not None
    if not supported:
        state, reason = "UNAVAILABLE", "Core ML audio classification requires Apple Silicon."
    elif model is None:
        state, reason = "STANDBY", "No approved Core ML audio classifier is configured."
    elif not model.exists():
        state, reason = "MISCONFIGURED", "The configured Core ML audio classifier cannot be found."
    elif not package:
        state, reason = "UNAVAILABLE", "The optional coremltools runtime is not installed."
    else:
        state, reason = "READY", "Configured for Core ML with all available Apple compute units."
    return {
        "state": state,
        "reason": reason,
        "runtimeAvailable": supported and package,
        "modelConfigured": model is not None,
        "computeUnits": "ALL",
    }


@lru_cache(maxsize=1)
def _load_model(model_path: str):
    import coremltools as ct  # Optional; called only after readiness checks.

    return ct.models.MLModel(model_path, compute_units=ct.ComputeUnit.ALL)


def _serializable(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {str(key): _serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serializable(item) for item in value]
    return value


def classify_audio(samples: np.ndarray, sample_rate: int) -> dict[str, Any] | None:
    """Classify mono float samples if an owner-approved compatible model exists.

    Models may use different input names, so ``DOZI_COREML_AUDIO_INPUT`` lets
    the model package declare one (default: ``audio_samples``).  Failure is
    deliberately non-fatal: audio-quality checks must still work without a
    model or if an incompatible model is selected.
    """
    status = classifier_status()
    if status["state"] != "READY":
        return None
    model = _configured_model()
    assert model is not None
    try:
        input_name = os.getenv("DOZI_COREML_AUDIO_INPUT", "audio_samples")
        audio = np.asarray(samples, dtype=np.float32)
        result = _load_model(str(model)).predict({input_name: audio, "sample_rate": np.int32(sample_rate)})
        return {"status": "COMPLETE", "runtime": "coreml", "outputs": _serializable(result)}
    except Exception:
        # Keep classification optional.  The diagnostics endpoint says it is
        # configured; this response simply avoids degrading an upload action.
        return {"status": "FAILED", "runtime": "coreml"}
