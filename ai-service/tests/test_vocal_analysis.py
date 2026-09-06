import io
import math
import struct
import sys
import wave
from types import SimpleNamespace

import numpy as np

from app.vocal_analysis import analyze_vocal, verify_identity_phrase


def vocal_wav(seconds: int = 20) -> bytes:
    rate = 16000
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(
            b"".join(
                struct.pack("<h", int(5000 * math.sin(2 * math.pi * 220 * i / rate)))
                for i in range(rate * seconds)
            )
        )
    return output.getvalue()


def test_clean_vocal_signal_passes_integrity_gate():
    result = analyze_vocal(vocal_wav())
    assert result["passed"] is True
    assert result["usableDurationSeconds"] >= 19
    assert result["metrics"]["channels"] == 1
    assert result["reasons"] == []


def test_packed_stereo_wav_duration_is_not_doubled():
    sample_rate = 44_100
    seconds = 2
    timeline = np.arange(sample_rate * seconds) / sample_rate
    mono = (np.sin(2 * np.pi * 220 * timeline) * 0.2 * 32767).astype(np.int16)
    stereo = np.column_stack((mono, mono)).reshape(-1)
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(stereo.tobytes())

    result = analyze_vocal(output.getvalue())

    assert result["metrics"]["durationSeconds"] == 2.0
    assert result["metrics"]["channels"] == 2


def test_fresh_identity_phrase_requires_local_transcript_match(monkeypatch):
    monkeypatch.setitem(
        sys.modules,
        "mlx_whisper",
        SimpleNamespace(
            transcribe=lambda *_args, **_kwargs: {
                "text": "Today I choose silver morning light."
            }
        ),
    )
    result = verify_identity_phrase(
        vocal_wav(), "Today I choose silver morning light."
    )
    assert result["passed"] is True
    assert result["phraseSimilarity"] == 1
    assert result["reasons"] == []
