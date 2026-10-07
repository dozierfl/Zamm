#!/usr/bin/env python3
"""Create a focused review list for an ACE-Step auto-labeled dataset.

The audit never changes ACE's dataset JSON or any audio sidecar.  It flags
captions that are blank, unusually short, duplicated, or appear to describe a
vocal song as instrumental, so review can focus on likely trouble spots.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


def normalise(text: str) -> str:
    return re.sub(r"\W+", " ", text.casefold()).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit ACE-Step caption drafts without modifying them.")
    parser.add_argument("dataset", type=Path, help="ACE-Step saved dataset JSON")
    parser.add_argument("--report-dir", type=Path, help="Directory for the resulting CSV and JSON reports")
    args = parser.parse_args()

    dataset_path = args.dataset.expanduser().resolve()
    if not dataset_path.is_file():
        raise SystemExit(f"Dataset JSON not found: {dataset_path}")
    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = data.get("samples", [])
    if not isinstance(samples, list) or not samples:
        raise SystemExit("Dataset has no samples to audit.")

    captions: defaultdict[str, list[int]] = defaultdict(list)
    for index, sample in enumerate(samples):
        captions[normalise(str(sample.get("caption", "")))].append(index)

    rows: list[dict[str, object]] = []
    flags: Counter[str] = Counter()
    for index, sample in enumerate(samples):
        caption = str(sample.get("caption", "")).strip()
        caption_key = normalise(caption)
        raw_lyrics = str(sample.get("raw_lyrics", "")).strip()
        problems: list[str] = []
        words = len(caption.split())
        if not caption:
            problems.append("missing caption")
        elif words < 12:
            problems.append("very short caption")
        # A song may legitimately contain an "instrumental break".  Flag only
        # captions that call the entire song instrumental while mentioning no
        # vocal/rap/voice content at all.
        says_instrumental = re.search(r"\binstrumental\b", caption, flags=re.IGNORECASE)
        says_vocals = re.search(
            r"\b(vocal|vocals|singer|singing|voice|spoken|lyrics|rapper|rap)\b",
            caption,
            flags=re.IGNORECASE,
        )
        if raw_lyrics and says_instrumental and not says_vocals:
            problems.append("likely instrumental audio paired with lyric file")
        if caption_key and len(captions[caption_key]) > 1:
            problems.append("exact duplicate caption")
        for problem in problems:
            flags[problem] += 1
        rows.append(
            {
                "sample": index + 1,
                "filename": sample.get("filename", ""),
                "captionWords": words,
                "hasReviewedLyrics": bool(raw_lyrics),
                "review": "YES" if problems else "",
                "reasons": "; ".join(problems),
                "caption": caption,
            }
        )

    report_dir = (args.report_dir or dataset_path.parent / "caption-audit").expanduser().resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    csv_path = report_dir / "caption-review-list.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": str(dataset_path),
        "total": len(rows),
        "reviewCount": sum(bool(row["review"]) for row in rows),
        "flagCounts": dict(flags),
        "reviewSamples": [row for row in rows if row["review"]],
        "csv": str(csv_path),
    }
    json_path = report_dir / "caption-review-list.json"
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Captions: {len(rows)} · review flags: {report['reviewCount']}")
    print(f"Flags: {dict(flags) or 'none'}")
    print(f"CSV: {csv_path}")
    print(f"JSON: {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
