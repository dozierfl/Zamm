#!/usr/bin/env python3
"""Report whether an ACE-Step LoRA audio folder is ready for preprocessing.

This is intentionally read-only: it never alters the selected audio, lyrics,
captions, or annotation files.  It distinguishes *present* sidecars from the
minimum metadata that ACE-Step can use reliably, so a training run is not
started with guessed or incomplete labels.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".opus"}
REQUIRED_JSON_FIELDS = ("bpm", "keyscale", "timesignature", "language")


def text_present(path: Path) -> bool:
    return path.is_file() and bool(path.read_text(encoding="utf-8").strip())


def annotation(path: Path) -> tuple[dict[str, object], str | None]:
    if not path.is_file():
        return {}, None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        return {}, f"invalid JSON: {error}"
    if not isinstance(value, dict):
        return {}, "JSON must contain an object"
    return value, None


def present(value: object) -> bool:
    return value is not None and (not isinstance(value, str) or bool(value.strip()))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a read-only ACE-Step LoRA corpus readiness report."
    )
    parser.add_argument("corpus", type=Path, help="Folder with the audio and ACE-Step sidecars")
    parser.add_argument(
        "--report-dir",
        type=Path,
        help="Where to write the reports (default: a readiness-report folder in the corpus)",
    )
    args = parser.parse_args()

    corpus = args.corpus.expanduser().resolve()
    if not corpus.is_dir():
        raise SystemExit(f"Corpus folder does not exist: {corpus}")
    report_dir = (args.report_dir or corpus / "readiness-report").expanduser().resolve()
    report_dir.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, object]] = []
    counts: Counter[str] = Counter()
    for audio in sorted(path for path in corpus.iterdir() if path.suffix.lower() in AUDIO_EXTENSIONS):
        stem = audio.with_suffix("")
        lyrics = audio.with_suffix(".lyrics.txt")
        caption = audio.with_suffix(".caption.txt")
        metadata_path = audio.with_suffix(".json")
        metadata, metadata_error = annotation(metadata_path)

        has_lyrics = text_present(lyrics)
        has_caption = text_present(caption) or present(metadata.get("caption"))
        missing_metadata = [field for field in REQUIRED_JSON_FIELDS if not present(metadata.get(field))]
        ready = has_lyrics and has_caption and not missing_metadata and not metadata_error
        problems: list[str] = []
        if not has_lyrics:
            problems.append("missing reviewed lyrics")
        if not has_caption:
            problems.append("missing caption")
        if missing_metadata:
            problems.append("missing " + ", ".join(missing_metadata))
        if metadata_error:
            problems.append(metadata_error)

        status = "READY" if ready else "NEEDS_METADATA"
        counts[status] += 1
        records.append(
            {
                "audio": audio.name,
                "lyrics": lyrics.name if lyrics.exists() else "",
                "caption": caption.name if caption.exists() else "",
                "json": metadata_path.name if metadata_path.exists() else "",
                "hasLyrics": has_lyrics,
                "hasCaption": has_caption,
                "bpm": metadata.get("bpm", ""),
                "keyscale": metadata.get("keyscale", ""),
                "timesignature": metadata.get("timesignature", ""),
                "language": metadata.get("language", ""),
                "status": status,
                "needs": "; ".join(problems),
            }
        )

    if not records:
        raise SystemExit(f"No supported audio files found in: {corpus}")

    fields = list(records[0])
    csv_path = report_dir / "ace-lora-readiness.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "corpus": str(corpus),
        "totalAudio": len(records),
        "readyForPreprocess": counts["READY"],
        "needsMetadata": counts["NEEDS_METADATA"],
        "withReviewedLyrics": sum(bool(record["hasLyrics"]) for record in records),
        "withCaptions": sum(bool(record["hasCaption"]) for record in records),
        "withCompleteBpmKeyTimeLanguage": sum(
            all(present(record[field]) for field in REQUIRED_JSON_FIELDS) for record in records
        ),
        "reportCsv": str(csv_path),
        "samples": records,
    }
    json_path = report_dir / "ace-lora-readiness.json"
    json_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print(f"Audio: {len(records)} · READY: {counts['READY']} · needs data: {counts['NEEDS_METADATA']}")
    print(
        "Reviewed lyrics: "
        f"{summary['withReviewedLyrics']} · captions: {summary['withCaptions']} · "
        f"complete BPM/key/time/language: {summary['withCompleteBpmKeyTimeLanguage']}"
    )
    print(f"CSV: {csv_path}")
    print(f"JSON: {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
