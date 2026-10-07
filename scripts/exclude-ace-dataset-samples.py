#!/usr/bin/env python3
"""Write a filtered ACE-Step dataset JSON without changing its source file.

Use this for samples whose audio and lyric sidecar clearly disagree.  The
original dataset and all WAVs remain untouched and recoverable.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a non-destructive filtered ACE-Step dataset JSON.")
    parser.add_argument("source", type=Path, help="Saved ACE-Step dataset JSON")
    parser.add_argument("output", type=Path, help="New filtered dataset JSON")
    parser.add_argument("--exclude", action="append", required=True, help="Exact audio filename to leave out; repeatable")
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Source dataset not found: {source}")
    if output.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {output}")
    excluded = set(args.exclude)
    data = json.loads(source.read_text(encoding="utf-8"))
    samples = data.get("samples", [])
    removed = [sample for sample in samples if sample.get("filename") in excluded]
    found = {sample.get("filename") for sample in removed}
    missing = sorted(excluded - found)
    if missing:
        raise SystemExit("Could not find: " + ", ".join(missing))
    data["samples"] = [sample for sample in samples if sample.get("filename") not in excluded]
    metadata = data.setdefault("metadata", {})
    metadata["name"] = f"{metadata.get('name') or 'dataset'}-vocal"
    metadata["num_samples"] = len(data["samples"])
    metadata["filteredAt"] = datetime.now(timezone.utc).isoformat()
    metadata["excludedBecauseAudioAppearsInstrumental"] = sorted(excluded)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(data['samples'])} samples; excluded {len(removed)}")
    print(f"Output: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
