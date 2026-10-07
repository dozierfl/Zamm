#!/usr/bin/env python3
"""Merge Key BPM Finder CSV exports into a copied ACE-Step dataset JSON.

The source dataset is never edited.  The script verifies that every dataset
audio filename appears exactly once across the CSV exports before producing an
output file, so a mismatched or overwritten batch cannot silently corrupt
training metadata.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def normalise_key(value: str) -> str:
    return " ".join(value.replace("♭", "b").replace("♯", "#").split())


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge measured BPM/key values into a copied ACE-Step dataset.")
    parser.add_argument("dataset", type=Path, help="Filtered ACE-Step dataset JSON")
    parser.add_argument("csv_dir", type=Path, help="Folder containing Key BPM Finder CSV exports")
    parser.add_argument("output", type=Path, help="New dataset JSON to write")
    parser.add_argument("--language", default="en", help="Language for reviewed lyrics (default: en)")
    args = parser.parse_args()

    dataset_path = args.dataset.expanduser().resolve()
    csv_dir = args.csv_dir.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not dataset_path.is_file() or not csv_dir.is_dir():
        raise SystemExit("Dataset JSON and CSV directory must both exist.")
    if output.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {output}")

    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = data.get("samples", [])
    expected = {str(sample.get("filename", "")) for sample in samples}
    if not expected or "" in expected:
        raise SystemExit("Dataset contains samples with missing filenames.")

    rows: list[tuple[str, str, str, str]] = []
    for csv_path in sorted(csv_dir.glob("*.csv")):
        with csv_path.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            required = {"File", "BPM", "Key"}
            if not required <= set(reader.fieldnames or []):
                raise SystemExit(f"CSV missing {sorted(required)}: {csv_path.name}")
            for row in reader:
                name = (row.get("File") or "").strip()
                bpm = (row.get("BPM") or "").strip()
                key = normalise_key((row.get("Key") or "").strip())
                if not name or not bpm or not key:
                    raise SystemExit(f"Incomplete row in {csv_path.name}: {row}")
                rows.append((name, bpm, key, csv_path.name))
    names = [row[0] for row in rows]
    counts = Counter(names)
    duplicates = sorted(name for name, count in counts.items() if count > 1)
    unexpected = sorted(set(names) - expected)
    missing = sorted(expected - set(names))
    if duplicates or unexpected or missing:
        details = []
        if duplicates:
            details.append("duplicate CSV names: " + ", ".join(duplicates))
        if unexpected:
            details.append("not in dataset: " + ", ".join(unexpected))
        if missing:
            details.append("missing CSV rows: " + ", ".join(missing))
        raise SystemExit("\n".join(details))

    measurements = {name: {"bpm": int(float(bpm)), "keyscale": key, "sourceCsv": source} for name, bpm, key, source in rows}
    for sample in samples:
        measurement = measurements[str(sample["filename"])]
        sample["bpm"] = measurement["bpm"]
        sample["keyscale"] = measurement["keyscale"]
        sample["language"] = args.language
        # Do not fabricate a time signature.  ACE-Step treats it as optional.
        sample["timesignature"] = sample.get("timesignature") or ""

    metadata = data.setdefault("metadata", {})
    metadata["name"] = f"{metadata.get('name') or 'dataset'}-bpm-key"
    metadata["keyBpmMergedAt"] = datetime.now(timezone.utc).isoformat()
    metadata["keyBpmCsvDirectory"] = str(csv_dir)
    metadata["keyBpmFiles"] = sorted({row[3] for row in rows})
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    report = {
        "dataset": str(dataset_path),
        "output": str(output),
        "samplesMerged": len(samples),
        "csvFiles": sorted({row[3] for row in rows}),
        "measurements": measurements,
    }
    report_path = output.with_name(output.stem + "-key-bpm-report.json")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Merged measured BPM/key for {len(samples)} songs")
    print(f"Dataset: {output}")
    print(f"Report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
