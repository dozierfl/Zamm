import base64
import hashlib
import io
import math
import wave
from typing import Any

import av
import numpy as np


def _decode_audio(
    data: bytes,
    *,
    sample_rate: int | None = None,
    channel_count: int | None = None,
) -> tuple[np.ndarray, int]:
    try:
        container = av.open(io.BytesIO(data))
        stream = container.streams.audio[0]
        output_rate = sample_rate or stream.codec_context.sample_rate or 48_000
        source_channels = len(stream.codec_context.layout.channels)
        output_channels = channel_count or min(2, max(1, source_channels))
        layout = "mono" if output_channels == 1 else "stereo"
        resampler = av.AudioResampler(format="fltp", layout=layout, rate=output_rate)
        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            for converted in resampler.resample(frame):
                chunks.append(
                    converted.to_ndarray().reshape(output_channels, -1).astype(np.float32)
                )
        for converted in resampler.resample(None):
            chunks.append(
                converted.to_ndarray().reshape(output_channels, -1).astype(np.float32)
            )
    except Exception as exc:
        raise ValueError("VOCAL_REPAIR_AUDIO_DECODE_FAILED") from exc
    if not chunks:
        raise ValueError("VOCAL_REPAIR_AUDIO_EMPTY")
    return np.concatenate(chunks, axis=1), output_rate


def _encode_pcm16_wav(audio: np.ndarray, sample_rate: int) -> bytes:
    clipped = np.clip(audio, -1, 1)
    interleaved = (clipped.T.reshape(-1) * 32767).round().astype("<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(audio.shape[0])
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(interleaved.tobytes())
    return output.getvalue()


def _waveform(audio: np.ndarray, points: int = 96) -> list[float]:
    mono = audio.mean(axis=0)
    if mono.size == 0:
        return []
    boundaries = np.linspace(0, mono.size, points + 1, dtype=int)
    return [
        round(float(np.max(np.abs(mono[boundaries[i] : boundaries[i + 1]]))), 4)
        if boundaries[i + 1] > boundaries[i]
        else 0.0
        for i in range(points)
    ]


def render_phrase_repair(
    source_data: bytes,
    replacement_data: bytes,
    *,
    start_seconds: float,
    end_seconds: float,
    crossfade_ms: int,
) -> dict[str, Any]:
    source, sample_rate = _decode_audio(source_data)
    duration_seconds = source.shape[1] / sample_rate
    if (
        not math.isfinite(start_seconds)
        or not math.isfinite(end_seconds)
        or start_seconds < 0
        or end_seconds <= start_seconds
        or end_seconds > duration_seconds + 0.02
        or crossfade_ms < 0
        or crossfade_ms > 500
    ):
        raise ValueError("VOCAL_REPAIR_REGION_INVALID")

    replacement, _ = _decode_audio(
        replacement_data,
        sample_rate=sample_rate,
        channel_count=source.shape[0],
    )
    start = min(source.shape[1], round(start_seconds * sample_rate))
    end = min(source.shape[1], round(end_seconds * sample_rate))
    region_length = end - start
    if region_length < 2:
        raise ValueError("VOCAL_REPAIR_REGION_INVALID")

    # A punch-in can be supplied either as a phrase-only take whose first sample
    # belongs at the repair boundary, or as a full, timeline-aligned vocal stem.
    # Treat near-equal source/replacement durations as the latter and take the
    # replacement from the same timeline coordinates. This prevents a localized
    # repair from accidentally inserting the beginning of a full-length take.
    duration_tolerance = max(round(0.05 * sample_rate), 1)
    timeline_aligned = (
        abs(replacement.shape[1] - source.shape[1]) <= duration_tolerance
    )
    replacement_start = start if timeline_aligned else 0
    replacement_end = min(replacement.shape[1], replacement_start + region_length)
    replacement_region = replacement[:, replacement_start:replacement_end]

    fitted = np.zeros((source.shape[0], region_length), dtype=np.float32)
    copied = min(region_length, replacement_region.shape[1])
    fitted[:, :copied] = replacement_region[:, :copied]

    source_region = source[:, start:end]
    source_rms = float(np.sqrt(np.mean(np.square(source_region), dtype=np.float64)))
    replacement_rms = float(np.sqrt(np.mean(np.square(fitted), dtype=np.float64)))
    gain_db = 0.0
    if source_rms > 1e-6 and replacement_rms > 1e-6:
        gain_db = float(
            np.clip(20 * np.log10(source_rms / replacement_rms), -6.0, 6.0)
        )
        fitted *= 10 ** (gain_db / 20)

    rendered = source.copy()
    fade = min(round(crossfade_ms * sample_rate / 1000), region_length // 2)
    if fade:
        theta = np.linspace(0, np.pi / 2, fade, endpoint=True, dtype=np.float32)
        fade_out = np.cos(theta)[None, :]
        fade_in = np.sin(theta)[None, :]
        rendered[:, start : start + fade] = (
            source_region[:, :fade] * fade_out + fitted[:, :fade] * fade_in
        )
        rendered[:, end - fade : end] = (
            fitted[:, -fade:] * fade_out + source_region[:, -fade:] * fade_in
        )
        rendered[:, start + fade : end - fade] = fitted[:, fade:-fade]
    else:
        rendered[:, start:end] = fitted

    peak = float(np.max(np.abs(rendered)))
    limiter_gain_db = 0.0
    if peak > 0.988553:
        limiter_gain_db = 20 * math.log10(0.988553 / peak)
        rendered *= 0.988553 / peak
        peak = float(np.max(np.abs(rendered)))

    audio = _encode_pcm16_wav(rendered, sample_rate)
    return {
        "audioBase64": base64.b64encode(audio).decode(),
        "mimeType": "audio/wav",
        "codec": "pcm_s16le",
        "sampleRate": sample_rate,
        "bitDepth": 16,
        "channels": int(rendered.shape[0]),
        "durationSeconds": round(rendered.shape[1] / sample_rate, 6),
        "checksum": hashlib.sha256(audio).hexdigest(),
        "waveformData": _waveform(rendered),
        "metadata": {
            "startSeconds": start / sample_rate,
            "endSeconds": end / sample_rate,
            "crossfadeMs": crossfade_ms,
            "replacementGainDb": round(gain_db, 3),
            "limiterGainDb": round(limiter_gain_db, 3),
            "replacementAlignment": (
                "FULL_TIMELINE" if timeline_aligned else "REGION_START"
            ),
            "replacementSourceStartSeconds": round(
                replacement_start / sample_rate, 6
            ),
            "replacementWasTrimmed": replacement_region.shape[1] > region_length,
            "replacementWasPadded": replacement_region.shape[1] < region_length,
            "peak": round(peak, 6),
        },
    }
