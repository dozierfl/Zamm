import io
import os
import re
from difflib import SequenceMatcher
from typing import Any

import av
import numpy as np


def analyze_vocal(data: bytes, minimum_usable_seconds: float = 15) -> dict[str, Any]:
    try:
        container = av.open(io.BytesIO(data))
        frames = []
        sample_rate = 0
        for frame in container.decode(audio=0):
            sample_rate = frame.sample_rate
            raw = frame.to_ndarray()
            samples = raw.astype(np.float32)
            if np.issubdtype(raw.dtype, np.integer):
                samples /= float(np.iinfo(raw.dtype).max)
            channel_count = len(frame.layout.channels)
            if frame.format.is_planar:
                channels = samples.reshape(channel_count, -1)
            else:
                channels = samples.reshape(-1, channel_count).T
            frames.append(channels)
    except Exception as exc:
        raise ValueError("VOCAL_AUDIO_DECODE_FAILED") from exc
    if not frames or not sample_rate:
        raise ValueError("VOCAL_AUDIO_EMPTY")
    channels = np.concatenate(frames, axis=1)
    mono = channels.mean(axis=0)
    duration = mono.size / sample_rate
    peak = float(np.max(np.abs(mono)))
    rms = float(np.sqrt(np.mean(np.square(mono))))
    rms_db = 20 * np.log10(max(rms, 1e-9))
    window = max(1, int(sample_rate * 0.02))
    usable = mono[: mono.size - (mono.size % window or window)].reshape(-1, window)
    window_rms = np.sqrt(np.mean(np.square(usable), axis=1)) if usable.size else np.array([rms])
    silence_ratio = float(np.mean(window_rms < 10 ** (-48 / 20)))
    clipping_ratio = float(np.mean(np.abs(mono) >= 0.999))
    channel_balance_db = 0.0
    if channels.shape[0] > 1:
        left = max(float(np.sqrt(np.mean(np.square(channels[0])))), 1e-9)
        right = max(float(np.sqrt(np.mean(np.square(channels[1])))), 1e-9)
        channel_balance_db = float(20 * np.log10(left / right))
    usable_seconds = round(duration * (1 - silence_ratio), 3)
    reasons = []
    if usable_seconds < minimum_usable_seconds: reasons.append("INSUFFICIENT_USABLE_AUDIO")
    if rms_db < -42: reasons.append("SIGNAL_TOO_QUIET")
    if rms_db > -6: reasons.append("SIGNAL_TOO_LOUD")
    if clipping_ratio > 0.0001: reasons.append("CLIPPING_DETECTED")
    # Natural vocal takes contain breaths, phrase gaps, and count-ins. Reject only
    # when more than half the capture is effectively silent.
    if silence_ratio > 0.55: reasons.append("EXCESSIVE_SILENCE")
    if abs(channel_balance_db) > 3: reasons.append("CHANNEL_IMBALANCE")
    passed = not reasons
    quality_score = max(0.0, min(100.0, 100 - silence_ratio * 45 - clipping_ratio * 5000 - max(0, abs(channel_balance_db) - 1) * 5))
    return {"passed": passed, "qualityScore": round(quality_score, 2), "usableDurationSeconds": usable_seconds if passed else 0, "metrics": {"durationSeconds": round(duration, 3), "sampleRate": sample_rate, "channels": int(channels.shape[0]), "peak": round(peak, 6), "rmsDbfs": round(float(rms_db), 2), "silenceRatio": round(silence_ratio, 5), "clippingRatio": round(clipping_ratio, 7), "channelBalanceDb": round(channel_balance_db, 2)}, "reasons": reasons}


def verify_identity_phrase(data: bytes, expected_phrase: str) -> dict[str, Any]:
    import mlx_whisper

    container = av.open(io.BytesIO(data))
    resampler = av.AudioResampler(format="flt", layout="mono", rate=16000)
    chunks = []
    for frame in container.decode(audio=0):
        for converted in resampler.resample(frame):
            chunks.append(converted.to_ndarray().reshape(-1).astype(np.float32))
    if not chunks:
        raise ValueError("VOCAL_AUDIO_EMPTY")
    audio = np.concatenate(chunks)
    transcription = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=os.getenv(
            "WHISPER_MODEL", "mlx-community/whisper-tiny.en-mlx"
        ),
        language="en",
        task="transcribe",
        initial_prompt=expected_phrase,
        condition_on_previous_text=False,
        verbose=None,
    )["text"].strip()
    normalize = lambda value: " ".join(re.findall(r"[a-z0-9]+", value.lower()))
    expected = normalize(expected_phrase)
    observed = normalize(transcription)
    similarity = SequenceMatcher(None, expected, observed).ratio()
    signal = analyze_vocal(data)
    signal_reasons = [
        reason
        for reason in signal["reasons"]
        if reason not in {"INSUFFICIENT_USABLE_AUDIO", "EXCESSIVE_SILENCE"}
    ]
    reasons = list(signal_reasons)
    if similarity < 0.78:
        reasons.append("PHRASE_MISMATCH")
    return {
        "passed": not reasons,
        "transcription": transcription,
        "phraseSimilarity": round(similarity, 4),
        "signal": signal,
        "reasons": reasons,
    }
