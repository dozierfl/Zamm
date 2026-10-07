"""Portable compute selection for Dozi's local AI workloads.

Engines do not all use the same device vocabulary: PyTorch calls Apple Metal
``mps``, MLX runs natively on Apple Silicon, and subprocess tools accept their
own ``--device`` argument.  This module is the one place where Dozi turns a
user/system preference into a safe, workload-specific target.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from functools import lru_cache
import importlib.util
import os
import platform
from typing import Literal


Accelerator = Literal["cpu", "mps", "cuda"]
Workload = Literal["music_generation", "stem_separation", "voice_conversion", "transcription", "audio_classification"]
_VALID_ACCELERATORS = {"auto", "cpu", "mps", "cuda"}


@dataclass(frozen=True)
class ComputeTarget:
    """Resolved device names plus a human-readable reason for the choice."""

    workload: Workload
    accelerator: Accelerator
    torch_device: str
    subprocess_device: str
    runtime: Literal["cpu", "pytorch", "mlx", "coreml"]
    requested: str
    reason: str

    def metadata(self) -> dict[str, str]:
        return {key: str(value) for key, value in asdict(self).items()}

    def environment(self) -> dict[str, str]:
        """Stable variables child processes may opt into without Dozi knowing them."""
        return {
            "DOZI_COMPUTE_BACKEND": self.accelerator,
            "DOZI_COMPUTE_WORKLOAD": self.workload,
            "DOZI_TORCH_DEVICE": self.torch_device,
            "DOZI_SUBPROCESS_DEVICE": self.subprocess_device,
            "DOZI_MODEL_RUNTIME": self.runtime,
        }


def _configured_backend(workload: Workload) -> str:
    specific = os.getenv(f"DOZI_{workload.upper()}_BACKEND")
    requested = (specific or os.getenv("DOZI_COMPUTE_BACKEND", "auto")).strip().lower()
    return requested if requested in _VALID_ACCELERATORS else "auto"


@lru_cache(maxsize=1)
def _is_apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine().lower() in {"arm64", "aarch64"}


@lru_cache(maxsize=1)
def _cuda_available() -> bool:
    """Do not require PyTorch in the gateway virtualenv merely to select CUDA."""
    if os.getenv("CUDA_VISIBLE_DEVICES", "").strip() == "-1":
        return False
    try:
        import torch  # type: ignore

        return bool(torch.cuda.is_available())
    except (ImportError, AttributeError):
        return False


@lru_cache(maxsize=1)
def _mlx_available() -> bool:
    return _is_apple_silicon() and importlib.util.find_spec("mlx") is not None


@lru_cache(maxsize=1)
def _coreml_available() -> bool:
    """Core ML is optional so the gateway remains portable outside macOS."""
    return _is_apple_silicon() and importlib.util.find_spec("coremltools") is not None


def resolve_compute_target(workload: Workload, requested: str | None = None) -> ComputeTarget:
    """Resolve a workload to CUDA, Apple Metal, or CPU with a safe fallback."""
    choice = (requested or _configured_backend(workload)).strip().lower()
    apple_silicon, cuda, mlx = _is_apple_silicon(), _cuda_available(), _mlx_available()

    if choice == "cuda" and not cuda:
        choice, reason = "cpu", "CUDA was requested but is unavailable; using CPU."
    elif choice == "mps" and not apple_silicon:
        choice, reason = "cpu", "Apple Metal was requested but this is not an Apple Silicon Mac; using CPU."
    elif choice == "auto":
        if apple_silicon:
            choice, reason = "mps", "Apple Silicon detected; using Metal acceleration."
        elif cuda:
            choice, reason = "cuda", "CUDA GPU detected; using CUDA acceleration."
        else:
            choice, reason = "cpu", "No supported GPU detected; using CPU."
    else:
        reason = f"{choice.upper()} selected by configuration."

    accelerator = choice if choice in {"cpu", "mps", "cuda"} else "cpu"
    runtime: Literal["cpu", "pytorch", "mlx", "coreml"] = "cpu"
    if accelerator == "mps":
        if workload == "audio_classification" and _coreml_available():
            runtime = "coreml"
            reason = "Apple Silicon and Core ML are available; preferring the Neural Engine-compatible runtime."
        else:
            runtime = "mlx" if mlx and workload in {"music_generation", "transcription"} else "pytorch"
    elif accelerator == "cuda":
        runtime = "pytorch"
    return ComputeTarget(
        workload=workload,
        accelerator=accelerator,
        torch_device=accelerator,
        subprocess_device=accelerator,
        runtime=runtime,
        requested=requested or _configured_backend(workload),
        reason=reason,
    )


def compute_capabilities() -> dict[str, object]:
    """A small, API-safe hardware report for diagnostics and future schedulers."""
    workloads: tuple[Workload, ...] = (
        "music_generation",
        "stem_separation",
        "voice_conversion",
        "transcription",
        "audio_classification",
    )
    return {
        "platform": {"system": platform.system(), "machine": platform.machine()},
        "available": {"appleSilicon": _is_apple_silicon(), "cuda": _cuda_available(), "mlx": _mlx_available(), "coreml": _coreml_available()},
        "policy": {"global": os.getenv("DOZI_COMPUTE_BACKEND", "auto")},
        "workloads": {workload: resolve_compute_target(workload).metadata() for workload in workloads},
    }


class LocalComputeScheduler:
    """Keeps large local AI jobs from competing for Apple unified memory.

    The default is intentionally conservative: one memory-heavy job at a time.
    A deployment can raise ``DOZI_HEAVY_WORKLOAD_CONCURRENCY`` after it has been
    benchmarked on that specific hardware.
    """

    def __init__(self) -> None:
        self._semaphore: asyncio.Semaphore | None = None
        self._waiting = 0
        self._active: dict[str, dict[str, str]] = {}

    def _gate(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            configured = os.getenv("DOZI_HEAVY_WORKLOAD_CONCURRENCY", "1")
            try:
                limit = max(1, min(4, int(configured)))
            except ValueError:
                limit = 1
            self._semaphore = asyncio.Semaphore(limit)
        return self._semaphore

    @asynccontextmanager
    async def reserve(self, workload: Workload, job_id: str):
        target = resolve_compute_target(workload)
        self._waiting += 1
        try:
            await self._gate().acquire()
        finally:
            self._waiting -= 1
        self._active[job_id] = target.metadata()
        try:
            yield target
        finally:
            self._active.pop(job_id, None)
            self._gate().release()

    def status(self) -> dict[str, object]:
        configured = os.getenv("DOZI_HEAVY_WORKLOAD_CONCURRENCY", "1")
        try:
            limit = max(1, min(4, int(configured)))
        except ValueError:
            limit = 1
        return {
            "heavyWorkloadConcurrency": limit,
            "waiting": self._waiting,
            "active": list(self._active.values()),
            "policy": "serialize-heavy-local-ai-workloads",
        }


local_compute_scheduler = LocalComputeScheduler()
