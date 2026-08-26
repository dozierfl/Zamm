import os
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from mlx_audio.music.generate import generate_music
from mlx_audio.music.utils import load_model
from pydantic import BaseModel, Field


MODEL_PATH = Path(os.getenv("MINIMAX_MODEL_PATH", "/Users/F.D/Projects/MiniMax-Music3-MLX/model"))
MODEL_NAME = os.getenv("MINIMAX_MODEL", "MiniMax-Music3-mxfp8")
app = FastAPI(title="Dozi MiniMax Music 3 MLX Service", version="0.1.0")
model = None
generation_lock = threading.Lock()


class GenerationRequest(BaseModel):
    caption: str = Field(min_length=1, max_length=12000)
    lyrics: str = Field(default="[instrumental]", max_length=12000)
    durationSeconds: int = Field(ge=5, le=300)
    seed: int = Field(ge=0)
    steps: int = Field(default=30, ge=1, le=100)
    model: str = MODEL_NAME


@app.on_event("startup")
def load_minimax_model() -> None:
    global model
    model = load_model(MODEL_PATH)


@app.get("/health")
def health():
    return {"status": "ready" if model is not None else "loading", "modelLoaded": model is not None, "model": MODEL_NAME}


@app.post("/v1/generate")
def generate(request: GenerationRequest):
    if model is None:
        raise HTTPException(503, "model not loaded")
    if not generation_lock.acquire(blocking=False):
        raise HTTPException(429, "generation already in progress")
    destination = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output:
            destination = Path(output.name)
        generate_music(
            caption=request.caption,
            lyrics=request.lyrics,
            model=model,
            duration=request.durationSeconds,
            steps=request.steps,
            seed=request.seed,
            output_path=destination,
            verbose=False,
        )
        data = destination.read_bytes()
        return Response(
            data,
            media_type="audio/wav",
            headers={
                "cache-control": "no-store",
                "x-minimax-model": MODEL_NAME,
                "x-minimax-seed": str(request.seed),
                "x-minimax-steps": str(request.steps),
            },
        )
    finally:
        if destination is not None:
            destination.unlink(missing_ok=True)
        generation_lock.release()
