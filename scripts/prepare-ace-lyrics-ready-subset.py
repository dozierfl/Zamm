#!/usr/bin/env python3
"""Build a non-destructive ACE-Step subset from candidates with reviewed lyrics.

Each WAV is hard-linked where possible, so the subset does not duplicate the
audio storage.  The source corpus is never modified or deleted.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


def same_file(first: Path, second: Path) -> bool:
    try:
        return os.path.samefile(first, second)
    except FileNotFoundError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a non-destructive ACE-Step subset containing only reviewed-lyrics WAVs."
    )
    parser.add_argument("source", type=Path, help="Staged source corpus")
    parser.add_argument("output", type=Path, help="New or existing subset folder")
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Source corpus does not exist: {source}")
    if source == output:
        raise SystemExit("Output must be a different folder from the source corpus.")
    output.mkdir(parents=True, exist_ok=True)

    selected: list[dict[str, str]] = []
    skipped = 0
    for audio in sorted(source.glob("*.wav")):
        lyrics = audio.with_suffix(".lyrics.txt")
        if not lyrics.is_file() or not lyrics.read_text(encoding="utf-8").strip():
            skipped += 1
            continue
        target_audio = output / audio.name
        target_lyrics = output / lyrics.name
        if target_audio.exists() and not same_file(audio, target_audio):
            raise SystemExit(
                f"Refusing to overwrite a different file already in output: {target_audio}"
            )
        if not target_audio.exists():
            try:
                os.link(audio, target_audio)
                storage = "hardlink"
            except OSError:
                shutil.copy2(audio, target_audio)
                storage = "copy"
        else:
            storage = "already_present"

        lyric_text = lyrics.read_text(encoding="utf-8").strip() + "\n"
        if target_lyrics.exists() and target_lyrics.read_text(encoding="utf-8") != lyric_text:
            raise SystemExit(
                f"Refusing to overwrite different lyrics already in output: {target_lyrics}"
            )
        if not target_lyrics.exists():
            target_lyrics.write_text(lyric_text, encoding="utf-8")
        selected.append({"audio": audio.name, "lyrics": lyrics.name, "storage": storage})

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(source),
        "output": str(output),
        "selected": len(selected),
        "skippedWithoutReviewedLyrics": skipped,
        "entries": selected,
    }
    path = output / "subset-manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Selected: {len(selected)} · skipped without reviewed lyrics: {skipped}")
    print(f"Manifest: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
