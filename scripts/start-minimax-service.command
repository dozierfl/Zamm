#!/bin/bash
set -euo pipefail

PROJECT="/Users/F.D/Projects/Zamm"
MINIMAX_HOME="/Users/F.D/Projects/MiniMax-Music3-MLX"

export HF_HOME="/Users/F.D/Projects/.tools/huggingface"
export MINIMAX_MODEL_PATH="$MINIMAX_HOME/model"
export MINIMAX_MODEL="MiniMax-Music3-mxfp8"

cd "$PROJECT"
exec "$MINIMAX_HOME/.venv/bin/uvicorn" server:app \
  --app-dir "$PROJECT/minimax-service" \
  --host 127.0.0.1 \
  --port 8002
