#!/usr/bin/env python3
"""Copy reviewed lyrics onto matching ACE-Step candidate WAVs, safely."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

VERSION_SUFFIX = re.compile(r"_(\d+)$")


def base_name(stem: str) -> str:
    return VERSION_SUFFIX.sub("", stem)


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def canonical(value: str) -> str:
    """Keep punctuation significant when an exact song-title match is available."""
    return " ".join(value.casefold().split())


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Apply reviewed .txt lyrics to matching WAV candidates without modifying the sources."
    )
    parser.add_argument("lyrics", type=Path, help="Folder containing reviewed plain-text lyrics")
    parser.add_argument("corpus", type=Path, help="Prepared dozi-style candidate folder")
    parser.add_argument(
        "--map",
        action="append",
        default=[],
        metavar="LYRIC_TITLE=SONG_TITLE",
        help="Explicitly map a lyric filename stem to a song-group title. Can be repeated.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace an existing sidecar only after the new lyric text was read successfully.",
    )
    args = parser.parse_args()
    lyrics_dir = args.lyrics.expanduser().resolve()
    corpus = args.corpus.expanduser().resolve()
    if not lyrics_dir.is_dir() or not corpus.is_dir():
        raise SystemExit("Both the lyrics folder and corpus folder must exist.")

    overrides: dict[str, str] = {}
    for item in args.map:
        if "=" not in item:
            raise SystemExit(f"Invalid --map value: {item!r}")
        source, target = item.split("=", 1)
        overrides[normalize(base_name(source))] = canonical(base_name(target))

    groups: dict[str, list[Path]] = defaultdict(list)
    titles: dict[str, set[str]] = defaultdict(set)
    normalized_groups: dict[str, set[str]] = defaultdict(set)
    for audio in sorted(corpus.glob("*.wav")):
        title = base_name(audio.stem)
        key = canonical(title)
        groups[key].append(audio)
        titles[key].add(title)
        normalized_groups[normalize(title)].add(key)
    if not groups:
        raise SystemExit(f"No WAV candidates found in: {corpus}")

    report: list[dict[str, object]] = []
    written = unchanged = failed = 0
    for lyric_file in sorted(lyrics_dir.glob("*.txt")):
        if lyric_file.name.startswith("."):
            continue
        lyric_text = lyric_file.read_text(encoding="utf-8").strip()
        lyric_title = base_name(lyric_file.stem)
        source_key = normalize(lyric_title)
        if source_key in overrides:
            target_key = overrides[source_key]
        else:
            exact_key = canonical(lyric_title)
            if exact_key in groups:
                target_key = exact_key
            else:
                normalized_matches = normalized_groups.get(source_key, set())
                target_key = next(iter(normalized_matches)) if len(normalized_matches) == 1 else ""
        targets = groups.get(target_key, [])
        entry: dict[str, object] = {
            "sourceLyrics": lyric_file.name,
            "targetSong": sorted(titles.get(target_key, [])),
            "status": "",
            "sidecars": [],
        }
        if not lyric_text:
            entry["status"] = "failed_empty_lyrics"
            report.append(entry)
            failed += 1
            continue
        if not targets:
            entry["status"] = "failed_no_unique_matching_song"
            report.append(entry)
            failed += 1
            continue
        for audio in targets:
            sidecar = audio.with_suffix(".lyrics.txt")
            if sidecar.exists() and not args.force:
                if sidecar.read_text(encoding="utf-8").strip() == lyric_text:
                    unchanged += 1
                    entry["sidecars"].append({"path": sidecar.name, "status": "already_matches"})
                    continue
                entry["sidecars"].append({"path": sidecar.name, "status": "exists_different"})
                failed += 1
                continue
            temporary = sidecar.with_suffix(".lyrics.txt.part")
            temporary.write_text(lyric_text + "\n", encoding="utf-8")
            temporary.replace(sidecar)
            written += 1
            entry["sidecars"].append({"path": sidecar.name, "status": "written"})
        statuses = {item["status"] for item in entry["sidecars"]}
        entry["status"] = "applied" if statuses <= {"written", "already_matches"} else "needs_attention"
        report.append(entry)

    report_path = corpus / "lyrics-import-report.json"
    report_path.write_text(
        json.dumps(
            {
                "exportedAt": datetime.now(timezone.utc).isoformat(),
                "lyricsDirectory": str(lyrics_dir),
                "corpus": str(corpus),
                "written": written,
                "alreadyMatching": unchanged,
                "failed": failed,
                "entries": report,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Lyrics sidecars: {written} written · {unchanged} already matching · {failed} needing attention")
    print(f"Report: {report_path}")
    return 2 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
