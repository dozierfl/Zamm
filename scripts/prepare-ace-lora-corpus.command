#!/bin/bash
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$PROJECT/ai-service/.venv/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  echo "Dozi's local AI environment is missing: $PYTHON"
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: $(basename "$0") '/path/to/Wav'"
  exit 1
fi

SOURCE="$1"
AUDIT="$(dirname "$SOURCE")/variant-audit/variant-audit.csv"
exec "$PYTHON" "$PROJECT/scripts/prepare-ace-lora-corpus.py" "$SOURCE" "$AUDIT"
