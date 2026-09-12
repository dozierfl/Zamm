import hashlib
import logging
import math
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

from .phrase_repair import _decode_audio, _encode_pcm16_wav, _waveform

logger = logging.getLogger("dozi.ai.artist_vocal")


def resolve_rvc_artifact(value: str, root: Path, suffix: str) -> Path:
    """Resolve a database model reference without permitting paths outside RVC."""
    if not value:
        raise ValueError("VOCAL_PROFILE_MODEL_UNAVAILABLE")
    root = root.expanduser().resolve()
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root)
    except (FileNotFoundError, ValueError):
        raise ValueError("VOCAL_PROFILE_MODEL_UNAVAILABLE") from None
    if not resolved.is_file() or resolved.suffix.lower() != suffix:
        raise ValueError("VOCAL_PROFILE_MODEL_UNAVAILABLE")
    return resolved


def _fit_length(audio: np.ndarray, frames: int) -> np.ndarray:
    if audio.shape[1] >= frames:
        return audio[:, :frames]
    return np.pad(audio, ((0, 0), (0, frames - audio.shape[1])))


def _rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(audio), dtype=np.float64)))


def _bounded_rms_match(
    audio: np.ndarray, reference: np.ndarray, maximum_change_db: float
) -> tuple[np.ndarray, float]:
    source_rms, reference_rms = _rms(audio), _rms(reference)
    if source_rms <= 1e-7 or reference_rms <= 1e-7:
        return audio, 0.0
    gain_db = float(
        np.clip(20 * np.log10(reference_rms / source_rms), -maximum_change_db, maximum_change_db)
    )
    return audio * (10 ** (gain_db / 20)), gain_db


def _limit(audio: np.ndarray) -> tuple[np.ndarray, float]:
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    ceiling = 0.988553
    if peak <= ceiling:
        return audio, 0.0
    gain = ceiling / peak
    return audio * gain, float(20 * math.log10(gain))


def render_artist_vocal(
    source_data: bytes,
    *,
    model_path: Path,
    index_path: Path,
    rvc_root: Path,
    separator_binary: Path,
    separator_models: Path,
    separator_model: str,
    separator_device: str,
) -> dict[str, Any]:
    if len(source_data) < 512:
        raise ValueError("VOCAL_IDENTITY_SOURCE_EMPTY")

    source, sample_rate = _decode_audio(source_data)
    frames = source.shape[1]
    channels = source.shape[0]
    if frames < sample_rate:
        raise ValueError("VOCAL_IDENTITY_SOURCE_EMPTY")

    with tempfile.TemporaryDirectory(prefix="dozi-artist-vocal-") as temporary:
        root = Path(temporary)
        source_dir, stems_dir = root / "source", root / "stems"
        source_dir.mkdir()
        stems_dir.mkdir()
        source_path = source_dir / "provider-master.wav"
        source_path.write_bytes(_encode_pcm16_wav(source, sample_rate))

        separator_command = [
            str(separator_binary),
            "--model",
            separator_model,
            "--models_dir",
            str(separator_models),
            "--input_folder",
            str(source_dir),
            "--store_dir",
            str(stems_dir),
            "--device",
            separator_device,
        ]
        separated = subprocess.run(
            separator_command,
            capture_output=True,
            text=True,
            timeout=3600,
            check=False,
        )
        if (
            separated.returncode != 0
            and separator_device == "mps"
            and "MPS backend" in separated.stderr
        ):
            separator_command[-1] = "cpu"
            separated = subprocess.run(
                separator_command,
                capture_output=True,
                text=True,
                timeout=3600,
                check=False,
            )
        if separated.returncode != 0:
            logger.error("Artist vocal separation failed: %s", separated.stderr[-4000:])
            raise RuntimeError("VOCAL_IDENTITY_SEPARATION_FAILED")

        vocal_matches = sorted(stems_dir.glob("*_vocals.wav"))
        if not vocal_matches:
            raise RuntimeError("VOCAL_IDENTITY_SEPARATION_FAILED")
        instrumental_paths = [
            matches[0]
            for stem in ("drums", "bass", "guitar", "piano", "other")
            if (matches := sorted(stems_dir.glob(f"*_{stem}.wav")))
        ]
        if len(instrumental_paths) < 3:
            raise RuntimeError("VOCAL_IDENTITY_SEPARATION_FAILED")

        converted_path = root / "artist-vocal.wav"
        index_rate = float(os.getenv("DOZI_RVC_INDEX_RATE", "0"))
        rvc_python = Path(
            os.getenv("DOZI_RVC_PYTHON", str(rvc_root / ".venv/bin/python"))
        )
        rvc_cli = Path(os.getenv("DOZI_RVC_CLI", str(rvc_root / "infer/cli.py")))
        if not rvc_python.is_file() or not rvc_cli.is_file():
            raise RuntimeError("VOCAL_IDENTITY_PROCESSOR_UNAVAILABLE")
        rvc_command = [
            str(rvc_python),
            str(rvc_cli),
            "--model",
            str(model_path),
            "--input",
            str(vocal_matches[0]),
            "--output",
            str(converted_path),
            "--pitch",
            "0",
            "--f0-method",
            os.getenv("DOZI_RVC_F0_METHOD", "rmvpe"),
            "--index-rate",
            str(index_rate),
            "--rms-mix-rate",
            os.getenv("DOZI_RVC_RMS_MIX_RATE", "1"),
            "--protect",
            os.getenv("DOZI_RVC_PROTECT", "0"),
            "--format",
            "wav",
            "--overwrite",
        ]
        if index_rate > 0:
            rvc_command.extend(["--index", str(index_path)])
        rvc_environment = os.environ.copy()
        rvc_environment["PYTHONPATH"] = str(rvc_root)
        numba_cache = Path(
            os.getenv(
                "DOZI_NUMBA_CACHE_DIR",
                str(Path(tempfile.gettempdir()) / "dozi-numba-cache"),
            )
        )
        numba_cache.mkdir(parents=True, exist_ok=True)
        rvc_environment["NUMBA_CACHE_DIR"] = str(numba_cache)
        converted_process = subprocess.run(
            rvc_command,
            cwd=str(rvc_root),
            env=rvc_environment,
            capture_output=True,
            text=True,
            timeout=3600,
            check=False,
        )
        if converted_process.returncode != 0 or not converted_path.is_file():
            logger.error(
                "Artist vocal conversion failed (exit %s): %s",
                converted_process.returncode,
                converted_process.stderr[-6000:],
            )
            raise RuntimeError("VOCAL_IDENTITY_CONVERSION_FAILED")

        separated_vocal, _ = _decode_audio(
            vocal_matches[0].read_bytes(),
            sample_rate=sample_rate,
            channel_count=channels,
        )
        converted_vocal, _ = _decode_audio(
            converted_path.read_bytes(),
            sample_rate=sample_rate,
            channel_count=channels,
        )
        separated_vocal = _fit_length(separated_vocal, frames)
        converted_vocal = _fit_length(converted_vocal, frames)
        converted_vocal, vocal_gain_db = _bounded_rms_match(
            converted_vocal, separated_vocal, 6.0
        )

        instrumental = np.zeros_like(source, dtype=np.float32)
        for path in instrumental_paths:
            stem, _ = _decode_audio(
                path.read_bytes(),
                sample_rate=sample_rate,
                channel_count=channels,
            )
            instrumental += _fit_length(stem, frames)
        rendered = instrumental + converted_vocal
        rendered, mix_gain_db = _bounded_rms_match(rendered, source, 3.0)
        converted_vocal *= 10 ** (mix_gain_db / 20)
        rendered, limiter_gain_db = _limit(rendered)
        converted_vocal *= 10 ** (limiter_gain_db / 20)

        master_bytes = _encode_pcm16_wav(rendered, sample_rate)
        vocal_bytes = _encode_pcm16_wav(converted_vocal, sample_rate)
        duration = round(frames / sample_rate, 6)
        common = {
            "mimeType": "audio/wav",
            "codec": "pcm_s16le",
            "sampleRate": sample_rate,
            "bitDepth": 16,
            "channels": channels,
            "durationSeconds": duration,
        }
        return {
            "master": {
                "bytes": master_bytes,
                "metadata": {
                    **common,
                    "checksum": hashlib.sha256(master_bytes).hexdigest(),
                    "waveformData": _waveform(rendered),
                },
            },
            "vocal": {
                "bytes": vocal_bytes,
                "metadata": {
                    **common,
                    "checksum": hashlib.sha256(vocal_bytes).hexdigest(),
                    "waveformData": _waveform(converted_vocal),
                },
            },
            "processing": {
                "separator": separator_model,
                "voiceModel": model_path.name,
                "retrievalIndex": index_path.name,
                "retrievalIndexRate": index_rate,
                "vocalGainDb": round(vocal_gain_db, 3),
                "mixGainDb": round(mix_gain_db, 3),
                "limiterGainDb": round(limiter_gain_db, 3),
            },
        }
