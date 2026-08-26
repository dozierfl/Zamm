#!/bin/bash
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECTS="$(dirname "$PROJECT")"
TOOLS="$PROJECTS/.tools"
ACESTEP="$PROJECTS/ACE-Step-1.5"
MINIMAX_HOME="$PROJECTS/MiniMax-Music3-MLX"
DOCKER="/Applications/Docker.app/Contents/Resources/bin/docker"
LOG_DIR="$TOOLS/logs"
STARTED_PIDS=()
PROVIDER="mock"

if [[ -f "$PROJECT/.dev.vars" ]]; then
  configured_provider="$(awk -F= '$1 == "MUSIC_PROVIDER" { value=substr($0,index($0,"=")+1) } END { print value }' "$PROJECT/.dev.vars")"
  [[ -n "$configured_provider" ]] && PROVIDER="$configured_provider"
fi

export PATH="$TOOLS/node/bin:$TOOLS/bin:$TOOLS/uv-bin:$PATH"
export UV_CACHE_DIR="$TOOLS/uv-cache"
export HF_HOME="$TOOLS/huggingface"
mkdir -p "$LOG_DIR"

cleanup(){ echo;echo "Stopping Dozi processes started by this launcher...";for pid in "${STARTED_PIDS[@]:-}";do if kill -0 "$pid" 2>/dev/null;then kill "$pid" 2>/dev/null||true;fi;done;wait 2>/dev/null||true;echo "Stopped. PostgreSQL and Docker Desktop remain running."; }
trap cleanup EXIT
trap 'exit 130' INT TERM

wait_for_command(){ local label="$1" timeout="$2" elapsed=0;shift 2;until "$@" >/dev/null 2>&1;do if((elapsed>=timeout));then echo "Timed out waiting for $label after ${timeout}s.";return 1;fi;sleep 2;elapsed=$((elapsed+2));done;echo "$label is ready."; }
wait_for_url(){ wait_for_command "$1" "$3" curl --fail --silent --show-error "$2"; }

echo "[1/5] Starting Docker Desktop..."
[[ -x "$DOCKER" ]]||{ echo "Docker CLI not found at $DOCKER";exit 1; }
"$DOCKER" info >/dev/null 2>&1||open -a Docker
wait_for_command "Docker" 180 "$DOCKER" info

echo "[2/5] Starting PostgreSQL..."
cd "$PROJECT";"$DOCKER" compose up -d postgres
wait_for_command "PostgreSQL" 90 "$DOCKER" compose exec -T postgres pg_isready -U dozi -d dozi

echo "[3/5] Preparing provider runtime ($PROVIDER)..."
if [[ "$PROVIDER" == "acestep" ]]; then
  if curl --fail --silent http://127.0.0.1:8001/health >/dev/null 2>&1;then
    curl --silent http://127.0.0.1:8001/health|grep -q 'acestep-v15-turbo'||{ echo "Port 8001 is running a non-turbo ACE-Step model. Stop it and retry.";exit 1; }
    echo "ACE-Step Turbo is already ready."
  else
    (export ACESTEP_CONFIG_PATH="acestep-v15-turbo" ACESTEP_INIT_LLM="false" ACESTEP_NO_INIT="false" ACESTEP_API_PORT="8001";cd "$ACESTEP";exec uv run acestep-api)>"$LOG_DIR/acestep-turbo.log" 2>&1&STARTED_PIDS+=("$!")
    wait_for_url "ACE-Step Turbo" "http://127.0.0.1:8001/health" 300
  fi

  echo "[4/5] Starting the Dozi AI gateway..."
  if curl --fail --silent http://127.0.0.1:8000/health >/dev/null 2>&1;then echo "Dozi AI gateway is already ready.";else
    (cd "$PROJECT/ai-service";exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000)>"$LOG_DIR/dozi-gateway.log" 2>&1&STARTED_PIDS+=("$!")
    wait_for_url "Dozi AI gateway" "http://127.0.0.1:8000/health" 120
  fi
elif [[ "$PROVIDER" == "minimax" ]]; then
  if curl --fail --silent http://127.0.0.1:8002/health | grep -q '"'"'"modelLoaded":true'"'"';then echo "MiniMax Music 3 MLX is already ready.";else
    [[ -x "$MINIMAX_HOME/.venv/bin/uvicorn" ]]||{ echo "MiniMax service environment is unavailable. See docs/LOCAL_DEVELOPMENT.md.";exit 1; }
    (export MINIMAX_MODEL_PATH="$MINIMAX_HOME/model" MINIMAX_MODEL="MiniMax-Music3-mxfp8";exec "$MINIMAX_HOME/.venv/bin/uvicorn" server:app --app-dir "$PROJECT/minimax-service" --host 127.0.0.1 --port 8002)>"$LOG_DIR/minimax-service.log" 2>&1&STARTED_PIDS+=("$!")
    wait_for_command "MiniMax Music 3 MLX" 120 bash -c 'curl --fail --silent http://127.0.0.1:8002/health | grep -q '"'"'"modelLoaded":true'"'"''
  fi
  echo "[4/5] Starting the Dozi AI gateway..."
  if curl --fail --silent http://127.0.0.1:8000/health | grep -q '"'"'"minimax"'"'"';then echo "Dozi AI gateway is already ready.";else
    if gateway_pid="$(lsof -ti tcp:8000 2>/dev/null)" && [[ -n "$gateway_pid" ]];then echo "Port 8000 is occupied by an older gateway process. Stop the previous Dozi launcher and retry.";exit 1;fi
    (export MINIMAX_BASE_URL="http://127.0.0.1:8002";cd "$PROJECT/ai-service";exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000)>"$LOG_DIR/dozi-gateway.log" 2>&1&STARTED_PIDS+=("$!")
    wait_for_command "Dozi AI gateway with MiniMax" 120 bash -c 'curl --fail --silent http://127.0.0.1:8000/health | grep -q '"'"'"minimax"'"'"''
  fi
elif [[ "$PROVIDER" == "ai-service" ]]; then
  echo "[4/5] Starting the Dozi AI gateway..."
  if curl --fail --silent http://127.0.0.1:8000/health >/dev/null 2>&1;then echo "Dozi AI gateway is already ready.";else
    (cd "$PROJECT/ai-service";exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000)>"$LOG_DIR/dozi-gateway.log" 2>&1&STARTED_PIDS+=("$!")
    wait_for_url "Dozi AI gateway" "http://127.0.0.1:8000/health" 120
  fi
else
  echo "Hosted/local provider needs no separate model process."
  echo "[4/5] Dozi AI gateway not required."
fi

echo "[5/5] Starting Dozi Music Studio..."
if curl --fail --silent http://localhost:3000/ >/dev/null 2>&1;then echo "Dozi is already running at http://localhost:3000";else
  (cd "$PROJECT";exec npm run dev)>"$LOG_DIR/dozi-web.log" 2>&1&STARTED_PIDS+=("$!")
  wait_for_url "Dozi Music Studio" "http://localhost:3000/" 120
fi

echo;echo "Dozi Music Studio is ready: http://localhost:3000";echo "Logs: $LOG_DIR";echo "Keep this window open. Press Control-C to stop services started here."
open "http://localhost:3000"
while true;do sleep 30;done
