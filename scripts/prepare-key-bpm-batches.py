#!/usr/bin/env python3
"""Create small hard-linked audio batches for BPM/key analysis.

The source dataset JSON decides exactly which songs are included.  WAVs are
hard-linked when possible; no source audio is changed or deleted.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare non-destructive BPM/key analysis batches.")
    parser.add_argument("dataset", type=Path, help="Filtered ACE-Step dataset JSON")
    parser.add_argument("output", type=Path, help="Folder for numbered audio batches")
    parser.add_argument("--size", type=int, default=10, help="Songs per batch (default: 10)")
    args = parser.parse_args()
    if args.size < 1:
        raise SystemExit("--size must be at least 1")

    dataset = args.dataset.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not dataset.is_file():
        raise SystemExit(f"Dataset JSON not found: {dataset}")
    data = json.loads(dataset.read_text(encoding="utf-8"))
    samples = data.get("samples", [])
    if not samples:
        raise SystemExit("Dataset contains no samples")
    output.mkdir(parents=True, exist_ok=True)

    manifest: list[dict[str, str | int]] = []
    for index, sample in enumerate(samples):
        source = Path(sample["audio_path"])
        if not source.is_file():
            raise SystemExit(f"Audio file missing: {source}")
        batch_number = index // args.size + 1
        batch_dir = output / f"batch-{batch_number:02d}"
        batch_dir.mkdir(exist_ok=True)
        target = batch_dir / source.name
        if target.exists():
            if not os.path.samefile(source, target):
                raise SystemExit(f"Refusing to overwrite unrelated file: {target}")
            storage = "already_present"
        else:
            try:
                os.link(source, target)
                storage = "hardlink"
            except OSError:
                shutil.copy2(source, target)
                storage = "copy"
        manifest.append({"batch": batch_number, "audio": source.name, "source": str(source), "storage": storage})

    manifest_path = output / "batch-manifest.csv"
    with manifest_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["batch", "audio", "source", "storage"])
        writer.writeheader()
        writer.writerows(manifest)
    (output / "csv").mkdir(exist_ok=True)
    print(f"Prepared {len(manifest)} songs in {max(row['batch'] for row in manifest)} batches")
    print(f"Manifest: {manifest_path}")
    print(f"Save exported CSVs in: {output / 'csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
