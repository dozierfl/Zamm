#!/usr/bin/env python3
"""Prepare a non-destructive ACE-Step LoRA candidate corpus.

The script hard-links selected WAV files into a new folder, so the candidates
occupy no additional audio storage on the same disk.  It deliberately does
not invent lyrics, captions, BPM, or musical keys: those sidecars must be
reviewed before this corpus is eligible for training.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
from pathlib import Path

INCLUDED = {"KEEP", "REVIEW_VARIANT"}


def link_or_copy(source: Path, destination: Path) -> str:
    if destination.exists():
        if os.path.samefile(source, destination):
            return "already linked"
        raise RuntimeError(f"Refusing to overwrite existing different file: {destination}")
    try:
        os.link(source, destination)
        return "hard linked"
    except OSError:
        shutil.copy2(source, destination)
        return "copied"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Stage vetted WAV candidates for an ACE-Step LoRA without changing originals."
    )
    parser.add_argument("source", type=Path, help="Original WAV folder")
    parser.add_argument("audit", type=Path, help="variant-audit.csv from audit-training-variants.py")
    parser.add_argument(
        "--output",
        type=Path,
        help="Corpus folder. Defaults to a sibling dozi-style-candidates folder.",
    )
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    audit = args.audit.expanduser().resolve()
    output = (args.output or source.parent / "dozi-style-candidates").expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Source folder not found: {source}")
    if not audit.is_file():
        raise SystemExit(f"Audit CSV not found: {audit}")

    with audit.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    candidates = [row for row in rows if row["recommendation"] in INCLUDED]
    if not candidates:
        raise SystemExit("The audit has no KEEP or REVIEW_VARIANT candidates.")

    output.mkdir(parents=True, exist_ok=True)
    manifest_rows: list[dict[str, str]] = []
    modes: dict[str, int] = {"hard linked": 0, "copied": 0, "already linked": 0}
    for row in candidates:
        original = source / row["relative_path"]
        if not original.is_file():
            raise RuntimeError(f"Audit refers to a missing source file: {original}")
        # Retain each exact filename: ACE-Step requires the sidecars to match it.
        staged = output / original.name
        mode = link_or_copy(original, staged)
        modes[mode] += 1
        manifest_rows.append(
            {
                "audio_file": staged.name,
                "base_song": row["base_song"],
                "version_number": row["version_number"],
                "audit_recommendation": row["recommendation"],
                "duration_seconds": row["duration_seconds"],
                "source_path": str(original),
                "lyrics_required": f"{staged.stem}.lyrics.txt",
                "caption_required": f"{staged.stem}.caption.txt",
                "metadata_required": f"{staged.stem}.json",
            }
        )

    manifest = output / "training-candidates.csv"
    with manifest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(manifest_rows[0]))
        writer.writeheader()
        writer.writerows(manifest_rows)
    (output / "training-candidates.json").write_text(
        json.dumps(
            {
                "source": str(source),
                "audit": str(audit),
                "candidateCount": len(manifest_rows),
                "requiresReview": True,
                "items": manifest_rows,
                "notes": [
                    "These files are hard links or copies of the originals; source recordings remain unchanged.",
                    "Each WAV needs matching reviewed lyrics, caption, and metadata sidecars before ACE-Step training.",
                    "Do not use placeholder text for training labels.",
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (output / "README.md").write_text(
        "# Dozi style training candidates\n\n"
        f"This folder contains {len(manifest_rows)} candidate WAVs selected by the variant audit. "
        "Original recordings were not changed.\n\n"
        "Before training, provide reviewed matching sidecars for every admitted file:\n\n"
        "- `song.lyrics.txt` — exact sung lyric text\n"
        "- `song.caption.txt` — concise, factual musical description\n"
        "- `song.json` — reviewed caption, BPM, keyscale, time signature, and language\n\n"
        "`training-candidates.csv` lists the source and required sidecar filenames.\n",
        encoding="utf-8",
    )
    print(f"Prepared {len(manifest_rows)} candidates in {output}")
    print(" · ".join(f"{count} {label}" for label, count in modes.items() if count))
    print(f"Manifest: {manifest}")
    print("No original audio was changed. Training labels remain intentionally pending review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
