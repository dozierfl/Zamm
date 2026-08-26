import io
import wave

import httpx
import pytest

from app.main import Request
from app.minimax import MiniMaxClient, MiniMaxError, MiniMaxRequestTranslator, MiniMaxSettings


@pytest.fixture
def anyio_backend():
    return "asyncio"


def request(vocal=True):
    return Request(
        jobId="j",
        userId="u",
        songId="s",
        versionId="v",
        seed=12,
        lyrics="[Verse]\nHello",
        compositionPlan={
            "genre": "Lo-fi soul",
            "mood": ["warm", "late-night"],
            "bpm": 78,
            "key": "Db",
            "scale": "major",
            "timeSignature": "4/4",
            "durationSeconds": 15,
            "instrumentation": [{"instrument": "Rhodes", "character": "warm"}],
            "vocal": {"enabled": vocal, "tone": "airy", "delivery": "soft"},
            "structure": [{"type": "verse", "description": "restrained"}],
            "generationCaption": "dusty drums and vinyl texture",
        },
    )


def wav_data():
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(44100)
        audio.writeframes(b"\0\0\0\0" * 44100)
    return output.getvalue()


def test_translator_maps_plan_lyrics_seed_and_instrumental():
    translator = MiniMaxRequestTranslator(MiniMaxSettings())
    payload = translator.translate(request())
    assert payload["durationSeconds"] == 15
    assert payload["seed"] == 12
    assert payload["steps"] == 30
    assert "78 BPM" in payload["caption"]
    assert "Rhodes" in payload["caption"]
    assert payload["lyrics"].startswith("[Verse]")
    assert translator.translate(request(False))["lyrics"] == "[instrumental]"


@pytest.mark.anyio
async def test_client_normalizes_wav_and_provider_metadata():
    async def handler(req):
        assert req.url.path == "/v1/generate"
        return httpx.Response(200, content=wav_data(), headers={"x-minimax-model": "MiniMax-Music3-mxfp8", "x-minimax-seed": "12", "x-minimax-steps": "30"})

    client = MiniMaxClient(MiniMaxSettings(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    result = await client.generate({"model": "MiniMax-Music3-mxfp8", "seed": 12, "steps": 30})
    assert result.sample_rate == 44100
    assert result.channels == 2
    assert result.provider_metadata["actualSeed"] == 12


@pytest.mark.anyio
async def test_client_rejects_offline_and_invalid_audio():
    async def offline(req):
        raise httpx.ConnectError("offline", request=req)

    with pytest.raises(MiniMaxError, match="GENERATION_PROVIDER_UNAVAILABLE"):
        await MiniMaxClient(MiniMaxSettings(), httpx.AsyncClient(transport=httpx.MockTransport(offline))).generate({"model": "m", "seed": 1, "steps": 1})

    async def invalid(req):
        return httpx.Response(200, content=b"not wav")

    with pytest.raises(MiniMaxError, match="GENERATION_INVALID_RESULT"):
        await MiniMaxClient(MiniMaxSettings(), httpx.AsyncClient(transport=httpx.MockTransport(invalid))).generate({"model": "m", "seed": 1, "steps": 1})
