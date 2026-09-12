#!/bin/bash
set -euo pipefail

RVC_ROOT="/Users/F.D/Projects/RVC-Dozi"
DOZI_ROOT="/Users/F.D/Projects/Zamm"
SNAPSHOT="$DOZI_ROOT/artifacts/vocal-training/fletchdeezie-v1"
DATASET="$SNAPSHOT/source-audio"
MANIFEST="$SNAPSHOT/training-manifest.json"
EXPERIMENT="fletchdeezie_dozi_profile_v1_40k"
EXPERIMENT_DIR="$RVC_ROOT/logs/$EXPERIMENT"
PYTHON="$RVC_ROOT/.venv/bin/python"
NUMBA_DIR="/private/tmp/dozi-rvc-numba-cache"

export NUMBA_CACHE_DIR="$NUMBA_DIR"
export RVC_AUDIO_FORCE_CPU="1"
export PYTHONPATH="$RVC_ROOT${PYTHONPATH:+:$PYTHONPATH}"
mkdir -p "$NUMBA_DIR" "$EXPERIMENT_DIR"

if [ ! -f "$MANIFEST" ]; then
  echo "Version 1 training snapshot is missing."
  exit 1
fi

cd "$RVC_ROOT"

if [ ! -f "$EXPERIMENT_DIR/.dozi-preprocess-complete" ]; then
  echo "[1/5] Preprocessing approved vocal clips..."
  "$PYTHON" -m train.preprocess "$DATASET" 40000 8 "$EXPERIMENT_DIR" False 3.7
  touch "$EXPERIMENT_DIR/.dozi-preprocess-complete"
else
  echo "[1/5] Preprocessing already complete."
fi

if [ ! -f "$EXPERIMENT_DIR/.dozi-f0-complete" ]; then
  echo "[2/5] Extracting singing pitch with RMVPE..."
  "$PYTHON" -m train.dataset.extract_f0 cpu "$EXPERIMENT_DIR" 8 rmvpe
  touch "$EXPERIMENT_DIR/.dozi-f0-complete"
else
  echo "[2/5] Pitch extraction already complete."
fi

if [ ! -f "$EXPERIMENT_DIR/.dozi-hubert-complete" ]; then
  echo "[3/5] Extracting vocal identity features..."
  "$PYTHON" -m train.dataset.extract_hubert_feature cpu 1 0 "$EXPERIMENT_DIR" v2 false
  touch "$EXPERIMENT_DIR/.dozi-hubert-complete"
else
  echo "[3/5] Vocal feature extraction already complete."
fi

"$PYTHON" "$DOZI_ROOT/scripts/prepare-rvc-experiment.py" \
  --rvc-root "$RVC_ROOT" \
  --experiment "$EXPERIMENT" \
  --manifest "$MANIFEST"

if [ ! -f "$EXPERIMENT_DIR/.dozi-epoch-25-complete" ]; then
  echo "[4/5] Training the Version 1 screening checkpoint (25 epochs)..."
  "$PYTHON" -m train.train \
    -e "$EXPERIMENT" \
    -sr 40k \
    -f0 1 \
    -bs 4 \
    -te 25 \
    -se 25 \
    -pg assets/pretrained_v2/f0G40k.pth \
    -pd assets/pretrained_v2/f0D40k.pth \
    -l 1 \
    -c 0 \
    -sw 1 \
    -v v2
  touch "$EXPERIMENT_DIR/.dozi-epoch-25-complete"
else
  echo "[4/5] Version 1 screening checkpoint already complete."
fi

echo "[5/5] Building the Version 1 retrieval index..."
"$PYTHON" -m train.train_index "$EXPERIMENT" v2 assets/indices 8 single

echo "Dozi vocal profile Version 1 screening model is ready."
echo "Model: $RVC_ROOT/assets/weights/${EXPERIMENT}.pth"
echo "Experiment: $EXPERIMENT_DIR"
