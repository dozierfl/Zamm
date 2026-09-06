import base64
import io
import wave

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.phrase_repair import render_phrase_repair


RATE = 16_000


def wav_bytes(frequency: float, seconds: float, amplitude: float = 0.2) -> bytes:
    time = np.arange(round(RATE * seconds), dtype=np.float32) / RATE
    samples = (np.sin(2 * np.pi * frequency * time) * amplitude * 32767).astype("<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(RATE)
        wav_file.writeframes(samples.tobytes())
    return output.getvalue()


def decode_wav(data: bytes) -> np.ndarray:
    with wave.open(io.BytesIO(data), "rb") as wav_file:
        return np.frombuffer(wav_file.readframes(wav_file.getnframes()), dtype="<i2")


def segmented_wav(segments: list[tuple[float, float]]) -> bytes:
    samples = np.concatenate(
        [
            np.full(round(RATE * seconds), amplitude * 32767, dtype="<i2")
            for amplitude, seconds in segments
        ]
    )
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(RATE)
        wav_file.writeframes(samples.tobytes())
    return output.getvalue()


def test_phrase_repair_preserves_timeline_and_audio_outside_region():
    source = wav_bytes(220, 2)
    replacement = wav_bytes(440, 0.5)
    result = render_phrase_repair(
        source,
        replacement,
        start_seconds=0.75,
        end_seconds=1.25,
        crossfade_ms=40,
    )
    rendered = decode_wav(base64.b64decode(result["audioBase64"]))
    original = decode_wav(source)
    assert rendered.size == original.size
    assert np.array_equal(rendered[: RATE // 2], original[: RATE // 2])
    assert np.array_equal(rendered[3 * RATE // 2 :], original[3 * RATE // 2 :])
    assert not np.array_equal(rendered[13_000:15_000], original[13_000:15_000])
    assert result["metadata"]["replacementWasTrimmed"] is False
    assert result["metadata"]["replacementWasPadded"] is False


def test_phrase_repair_endpoint_returns_private_render_payload():
    client = TestClient(app)
    response = client.post(
        "/v1/phrase-repair-render",
        json={
            "sourceAudioBase64": base64.b64encode(wav_bytes(220, 1)).decode(),
            "replacementAudioBase64": base64.b64encode(wav_bytes(330, 0.25)).decode(),
            "startSeconds": 0.25,
            "endSeconds": 0.75,
            "crossfadeMs": 80,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["mimeType"] == "audio/wav"
    assert data["durationSeconds"] == 1
    assert data["metadata"]["replacementWasPadded"] is True
    assert len(data["waveformData"]) == 96


def test_phrase_repair_uses_matching_coordinates_for_full_timeline_take():
    source = segmented_wav([(0.1, 2.0)])
    replacement = segmented_wav([(0.2, 0.75), (0.6, 0.5), (0.3, 0.75)])
    result = render_phrase_repair(
        source,
        replacement,
        start_seconds=0.75,
        end_seconds=1.25,
        crossfade_ms=0,
    )
    rendered = decode_wav(base64.b64decode(result["audioBase64"]))

    assert result["metadata"]["replacementAlignment"] == "FULL_TIMELINE"
    assert result["metadata"]["replacementSourceStartSeconds"] == 0.75
    assert np.array_equal(rendered[: 12_000], decode_wav(source)[: 12_000])
    assert np.all(rendered[12_000:20_000] > 9_000)
    assert np.array_equal(rendered[20_000:], decode_wav(source)[20_000:])
