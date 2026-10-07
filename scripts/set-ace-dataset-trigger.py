#!/usr/bin/env python3
"""Set a custom activation tag in a copied ACE-Step dataset JSON."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Set a custom trigger tag without editing the source dataset.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("tag", help="Trigger phrase used with generation captions")
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    output = args.output.expanduser().resolve()
    tag = args.tag.strip()
    if not source.is_file() or not tag:
        raise SystemExit("Source dataset must exist and trigger tag must not be empty.")
    if output.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {output}")
    data = json.loads(source.read_text(encoding="utf-8"))
    samples = data.get("samples", [])
    if not samples:
        raise SystemExit("Dataset contains no samples.")
    metadata = data.setdefault("metadata", {})
    metadata["name"] = f"{metadata.get('name') or 'dataset'}-triggered"
    metadata["custom_tag"] = tag
    metadata["tag_position"] = "prepend"
    metadata["triggerSetAt"] = datetime.now(timezone.utc).isoformat()
    for sample in samples:
        sample["custom_tag"] = tag
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Applied trigger '{tag}' to {len(samples)} samples")
    print(f"Dataset: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
