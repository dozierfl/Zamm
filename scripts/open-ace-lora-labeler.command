#!/usr/bin/env bash
# Open ACE-Step's local LoRA dataset screen on this Apple-silicon Mac.
# It initializes the local caption model but does not start preprocessing or
# model training. Those require explicit actions in the ACE-Step UI.

set -euo pipefail

ACE_ROOT="/Users/F.D/Projects/ACE-Step-1.5"
if [[ ! -x "$ACE_ROOT/start_gradio_ui_macos.sh" ]]; then
  echo "ACE-Step's macOS launcher was not found at:"
  echo "  $ACE_ROOT/start_gradio_ui_macos.sh"
  echo "Install or repair ACE-Step, then run this again."
  read -r -p "Press Return to close..." _
  exit 1
fi

echo "Opening ACE-Step locally for LoRA dataset labeling..."
echo "Dataset: /Users/F.D/Projects/ACE-Step-1.5/datasets/dozi-style-lyrics-ready"
echo
echo "This launcher initializes ACE-Step's local caption model. It does NOT train a model."
echo "In the app: LoRA Training > Scan the dataset > Auto Label captions > review."
echo
cd "$ACE_ROOT"
export INIT_SERVICE="--init_service true"
export CHECK_UPDATE="false"
exec ./start_gradio_ui_macos.sh
