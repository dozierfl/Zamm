import os
import wave
from io import BytesIO

import httpx
import pytest


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_ACESTEP_INTEGRATION") != "1",
    reason="set RUN_ACESTEP_INTEGRATION=1 with both local services running",
)


def test_real_ace_step_generation_through_gateway():
    """Opt-in smoke test for the official server through Dozi's provider gateway."""
    gateway = os.getenv("AI_SERVICE_BASE_URL", "http://127.0.0.1:8000")
    request = {
        "jobId": "live-ace-step-smoke",
        "userId": "integration-user",
        "songId": "integration-song",
        "versionId": "integration-version",
        "seed": 7416,
        "lyrics": "",
        "compositionPlan": {
            "genre": "neo-soul",
            "mood": ["warm", "reflective"],
            "bpm": 74,
            "key": "F#",
            "scale": "minor",
            "timeSignature": "4/4",
            "durationSeconds": 10,
            "instrumentation": [
                {"instrument": "Rhodes", "character": "warm"},
                {"instrument": "electric bass", "character": "rounded"},
                {"instrument": "live drums", "character": "laid-back"},
            ],
            "vocal": {"enabled": False},
            "generationCaption": "laid-back pocket",
        },
    }

    with httpx.Client(timeout=1_200) as client:
        response = client.post(f"{gateway}/v1/ace-step-generation", json=request)
        response.raise_for_status()
        result = response.json()
        assert result["provider"] == "ace-step-1.5"
        assert result["model"] == "acestep-v15-turbo"
        assert result["assets"][0]["role"] == "MASTER"
        audio = client.get(result["assets"][0]["audio"]["sourceUrl"])
        audio.raise_for_status()

    with wave.open(BytesIO(audio.content), "rb") as wav:
        assert wav.getnchannels() == 2
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == 48_000
        assert wav.getnframes() > 0
