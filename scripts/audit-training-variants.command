#!/bin/bash
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$PROJECT/ai-service/.venv/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  echo "Dozi's local AI environment is missing: $PYTHON"
  exit 1
fi

exec "$PYTHON" "$PROJECT/scripts/audit-training-variants.py" "$@"
