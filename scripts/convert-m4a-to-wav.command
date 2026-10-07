#!/bin/bash
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$PROJECT/ai-service/.venv/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  echo "Dozi's local AI environment is missing: $PYTHON"
  exit 1
fi

# With no argument, the converter uses the folder from which this command was
# run. Pass a quoted folder path to convert another song folder.
exec "$PYTHON" "$PROJECT/scripts/convert-m4a-to-wav.py" "$@"
