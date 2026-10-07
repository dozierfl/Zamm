#!/usr/bin/env python3
"""Create a one-sample ACE-Step dataset copy for a safe preprocessing test."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a one-song ACE-Step preprocessing smoke-test dataset.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("filename", help="Exact audio filename to include")
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Source dataset not found: {source}")
    if output.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {output}")
    data = json.loads(source.read_text(encoding="utf-8"))
    matches = [sample for sample in data.get("samples", []) if sample.get("filename") == args.filename]
    if len(matches) != 1:
        raise SystemExit(f"Expected one matching filename, found {len(matches)}: {args.filename}")
    data["samples"] = matches
    metadata = data.setdefault("metadata", {})
    metadata["name"] = f"{metadata.get('name') or 'dataset'}-smoke-test"
    metadata["num_samples"] = 1
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Smoke test created for {args.filename}")
    print(f"Dataset: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
