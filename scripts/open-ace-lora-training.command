#!/usr/bin/env bash
# Open ACE-Step for LoRA training on this Apple-silicon Mac.
# The caption LM is deliberately disabled so its memory is available to training.

set -euo pipefail

ACE_ROOT="/Users/F.D/Projects/ACE-Step-1.5"
TENSOR_PATH="$ACE_ROOT/datasets/dozi-style-lyrics-ready/dozi-style-tensors-full"

if [[ ! -x "$ACE_ROOT/start_gradio_ui_macos.sh" ]]; then
  echo "ACE-Step's macOS launcher was not found at:"
  echo "  $ACE_ROOT/start_gradio_ui_macos.sh"
  read -r -p "Press Return to close..." _
  exit 1
fi

if [[ ! -f "$TENSOR_PATH/manifest.json" ]]; then
  echo "The preprocessed Dozi-style tensors were not found at:"
  echo "  $TENSOR_PATH"
  read -r -p "Press Return to close..." _
  exit 1
fi

echo "Opening ACE-Step for Dozi-style LoRA training..."
echo "Tensors: $TENSOR_PATH"
echo "The caption/lyrics model is disabled to reserve memory for training."
echo

cd "$ACE_ROOT"
export INIT_SERVICE="--init_service true"
export INIT_LLM="--init_llm false"
export CHECK_UPDATE="false"
exec ./start_gradio_ui_macos.sh
