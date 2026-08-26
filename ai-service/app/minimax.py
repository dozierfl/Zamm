import hashlib
import io
import wave
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel


class MiniMaxError(Exception):
    def __init__(self, code: str, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class MiniMaxSettings(BaseModel):
    base_url: str = "http://127.0.0.1:8002"
    model: str = "MiniMax-Music3-mxfp8"
    timeout_seconds: float = 1800
    steps: int = 30


@dataclass
class MiniMaxAudio:
    data: bytes
    mime_type: str
    codec: str
    sample_rate: int
    bit_depth: int
    channels: int
    duration_seconds: float
    checksum: str
    waveform: list[float]
    provider_metadata: dict[str, Any]


class MiniMaxRequestTranslator:
    def __init__(self, settings: MiniMaxSettings):
        self.settings = settings

    def translate(self, request: Any) -> dict[str, Any]:
        plan = request.compositionPlan
        instruments = ", ".join(
            f"{item.instrument} ({item.character})" for item in plan.instrumentation
        )
        sections = "; ".join(
            f"{item.get('type', 'section')}: {item.get('description', '')}"
            for item in plan.structure
        )
        caption = " ".join(
            part
            for part in (
                f"Global Metadata: {plan.genre}, {plan.bpm} BPM, {plan.key} {plan.scale}, {plan.timeSignature}.",
                f"Mood: {', '.join(plan.mood)}." if plan.mood else "",
                f"Vocal Details: {plan.vocal.tone}; {plan.vocal.delivery}." if plan.vocal.enabled else "Instrumental; no vocals.",
                f"Arrangement: {instruments}. {plan.generationCaption} {sections}",
                f"Avoid: {', '.join(plan.negativeInstructions)}." if plan.negativeInstructions else "",
            )
            if part
        )
        options = request.providerOptions or {}
        return {
            "caption": caption,
            "lyrics": request.lyrics.strip() if plan.vocal.enabled else "[instrumental]",
            "durationSeconds": plan.durationSeconds,
            "seed": request.seed,
            "steps": int(options.get("steps", self.settings.steps)),
            "model": self.settings.model,
        }


class MiniMaxClient:
    def __init__(self, settings: MiniMaxSettings, client: httpx.AsyncClient | None = None):
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=settings.timeout_seconds)

    async def health(self) -> dict[str, Any]:
        try:
            response = await self.client.get(f"{self.settings.base_url}/health")
            data = response.json() if response.is_success else {}
            return {
                "apiAvailable": response.is_success,
                "modelLoaded": bool(data.get("modelLoaded")),
                "model": data.get("model", self.settings.model),
                "ready": response.is_success and bool(data.get("modelLoaded")),
            }
        except (httpx.HTTPError, ValueError):
            return {"apiAvailable": False, "modelLoaded": False, "model": self.settings.model, "ready": False}

    async def generate(self, payload: dict[str, Any]) -> MiniMaxAudio:
        try:
            response = await self.client.post(f"{self.settings.base_url}/v1/generate", json=payload)
        except httpx.TimeoutException as exc:
            raise MiniMaxError("GENERATION_TIMEOUT", True) from exc
        except httpx.HTTPError as exc:
            raise MiniMaxError("GENERATION_PROVIDER_UNAVAILABLE", True) from exc
        if not response.is_success:
            raise MiniMaxError("GENERATION_PROVIDER_UNAVAILABLE" if response.status_code >= 500 else "GENERATION_PROVIDER_FAILED", response.status_code >= 500)
        return self._inspect_wav(response.content, payload, response.headers)

    def _inspect_wav(self, data: bytes, payload: dict[str, Any], headers: httpx.Headers) -> MiniMaxAudio:
        try:
            with wave.open(io.BytesIO(data), "rb") as audio:
                channels = audio.getnchannels()
                rate = audio.getframerate()
                width = audio.getsampwidth()
                frames = audio.getnframes()
                duration = frames / rate
                if channels not in (1, 2) or rate < 8000 or width not in (2, 3, 4) or duration < 1:
                    raise ValueError
                raw = audio.readframes(frames)
                waveform = []
                step = max(1, frames // 96)
                for index in range(96):
                    offset = min(len(raw) - width, max(0, index * step * channels * width))
                    sample = int.from_bytes(raw[offset : offset + width], "little", signed=True)
                    waveform.append(round(abs(sample) / (2 ** (width * 8 - 1)), 4))
        except (EOFError, wave.Error, ValueError) as exc:
            raise MiniMaxError("GENERATION_INVALID_RESULT") from exc
        return MiniMaxAudio(
            data=data,
            mime_type="audio/wav",
            codec=f"pcm_s{width * 8}le",
            sample_rate=rate,
            bit_depth=width * 8,
            channels=channels,
            duration_seconds=duration,
            checksum=hashlib.sha256(data).hexdigest(),
            waveform=waveform,
            provider_metadata={
                "model": headers.get("x-minimax-model", payload["model"]),
                "actualSeed": int(headers.get("x-minimax-seed", payload["seed"])),
                "steps": int(headers.get("x-minimax-steps", payload["steps"])),
            },
        )
