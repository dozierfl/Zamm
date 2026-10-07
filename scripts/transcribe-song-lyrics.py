#!/usr/bin/env python3
"""Create one reviewable lyrics draft per song from a local audio folder.

The file convention intentionally treats ``Song_1.m4a``, ``Song_2.m4a``, and
``Song_3.m4a`` as alternate versions of ``Song``. It transcribes one preferred
version and writes only ``Lyrics/Song.lyrics.txt``. Existing lyric files are
never overwritten unless --overwrite is supplied.
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from collections import defaultdict
from pathlib import Path

import av
import numpy as np

AUDIO_SUFFIXES = {".aif", ".aiff", ".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav"}
FORMAT_PRIORITY = {
    ".flac": 0,
    ".wav": 1,
    ".aif": 2,
    ".aiff": 2,
    ".m4a": 3,
    ".mp3": 4,
    ".ogg": 5,
    ".opus": 5,
}
VERSION_SUFFIX = re.compile(r"_(\d+)$")


def song_name_and_version(path: Path) -> tuple[str, int]:
    match = VERSION_SUFFIX.search(path.stem)
    if not match:
        return path.stem, 0
    return path.stem[: match.start()], int(match.group(1))


def discover_audio(source: Path) -> dict[tuple[Path, str], list[Path]]:
    groups: dict[tuple[Path, str], list[Path]] = defaultdict(list)
    for candidate in source.rglob("*"):
        if not candidate.is_file() or candidate.suffix.lower() not in AUDIO_SUFFIXES:
            continue
        relative = candidate.relative_to(source)
        if any(part in {"Lyrics", "WAV"} for part in relative.parts):
            continue
        song_name, _ = song_name_and_version(candidate)
        groups[(candidate.parent, song_name.casefold())].append(candidate)
    return groups


def preferred_version(candidates: list[Path]) -> Path:
    def rank(candidate: Path) -> tuple[int, int, str]:
        _, version = song_name_and_version(candidate)
        return (
            0 if version == 0 else 1,
            FORMAT_PRIORITY.get(candidate.suffix.lower(), 99),
            candidate.name.casefold(),
        )

    return min(candidates, key=rank)


def decode_for_whisper(audio_path: Path) -> np.ndarray:
    """Decode with PyAV instead of afconvert, which rejects some AAC M4A files."""
    chunks: list[np.ndarray] = []
    with av.open(str(audio_path)) as source:
        stream = next((item for item in source.streams if item.type == "audio"), None)
        if stream is None:
            raise RuntimeError("No audio stream found")
        resampler = av.audio.resampler.AudioResampler(
            format="flt", layout="mono", rate=16_000
        )
        for frame in source.decode(stream):
            for converted in resampler.resample(frame):
                chunks.append(
                    converted.to_ndarray().reshape(-1).astype(np.float32, copy=False)
                )
        for converted in resampler.resample(None):
            chunks.append(converted.to_ndarray().reshape(-1).astype(np.float32, copy=False))
    if not chunks:
        raise RuntimeError("Audio has no decodable samples")
    return np.concatenate(chunks)


def normalized_words(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9']+", text.casefold()))


def format_structured_lyrics(result: dict[str, object]) -> str:
    """Make a readable, review-required song-form draft from Whisper segments.

    Repeated lyric blocks are likely refrains/choruses.  The labels are only
    suggestions: vocal ad-libs, sparse lyrics, and unusual arrangements need
    a musician to approve their final section names.
    """
    raw_segments = result.get("segments")
    if not isinstance(raw_segments, list):
        return str(result.get("text", "")).strip()

    blocks: list[str] = []
    current: list[str] = []
    previous_end: float | None = None
    for item in raw_segments:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        start = float(item.get("start", 0.0))
        if current and previous_end is not None and start - previous_end >= 1.4:
            blocks.append("\n".join(current))
            current = []
        current.append(text)
        previous_end = float(item.get("end", start))
    if current:
        blocks.append("\n".join(current))
    if not blocks:
        return str(result.get("text", "")).strip()

    seen: list[str] = []
    verse_number = 0
    chorus_seen = 0
    formatted: list[str] = []
    for index, block in enumerate(blocks):
        normalized = normalized_words(block)
        similarity = max(
            (
                difflib.SequenceMatcher(None, normalized, earlier).ratio()
                for earlier in seen
                if normalized and earlier
            ),
            default=0.0,
        )
        word_count = len(normalized.split())
        if index == 0 and word_count <= 10:
            label = "[Intro]"
        elif similarity >= 0.72:
            chorus_seen += 1
            label = "[Chorus]" if chorus_seen == 1 else f"[Chorus {chorus_seen}]"
        elif chorus_seen and index == len(blocks) - 1 and word_count <= 16:
            label = "[Outro]"
        elif chorus_seen >= 2 and word_count <= 24:
            label = "[Bridge — review]"
        else:
            verse_number += 1
            label = f"[Verse {verse_number}]"
        formatted.extend((label, block, ""))
        if normalized:
            seen.append(normalized)
    return "\n".join(formatted).strip()


def find_local_model() -> Path:
    projects = Path(__file__).resolve().parents[2]
    snapshots = projects.glob(
        ".tools/huggingface/hub/models--mlx-community--whisper-tiny.en-mlx/snapshots/*"
    )
    for snapshot in snapshots:
        if (snapshot / "config.json").is_file() and (snapshot / "weights.npz").is_file():
            return snapshot
    raise FileNotFoundError(
        "The local Whisper model is not present. Expected the cached "
        "mlx-community/whisper-tiny.en-mlx model under Projects/.tools/huggingface."
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create one local draft lyrics file for each base song name."
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=Path.cwd(),
        type=Path,
        help="Song folder to scan. Defaults to the current folder.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing .lyrics.txt drafts instead of skipping them.",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Spoken lyric language for Whisper (default: en).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Process at most this many base songs; useful for a safe first test.",
    )
    args = parser.parse_args()
    source = args.directory.expanduser().resolve()
    if not source.is_dir():
        print(f"Song folder not found: {source}", file=sys.stderr)
        return 1

    try:
        model_path = find_local_model()
        from mlx_whisper import transcribe
    except (FileNotFoundError, ImportError) as error:
        print(str(error), file=sys.stderr)
        return 1

    groups = discover_audio(source)
    if not groups:
        print(f"No supported audio files were found in: {source}", file=sys.stderr)
        return 1

    created: list[Path] = []
    skipped = 0
    failed = 0
    print("Creating local draft lyric files. No audio is uploaded or changed.")
    print("Every result must be reviewed against the recording before training.\n")

    ordered_groups = sorted(groups.items())
    if args.limit is not None:
        if args.limit < 1:
            print("--limit must be at least 1", file=sys.stderr)
            return 1
        ordered_groups = ordered_groups[: args.limit]

    for index, ((parent, _), candidates) in enumerate(ordered_groups):
            song_name, _ = song_name_and_version(candidates[0])
            relative_parent = parent.relative_to(source)
            lyrics_path = source / "Lyrics" / relative_parent / f"{song_name}.lyrics.txt"
            if lyrics_path.exists() and not args.overwrite:
                print(f"Already has lyrics — skipping: {lyrics_path.relative_to(source)}")
                skipped += 1
                continue

            audio_path = preferred_version(candidates)
            print(f"Transcribing {song_name} from {audio_path.relative_to(source)}…")
            try:
                pcm = decode_for_whisper(audio_path)
                result = transcribe(
                    pcm,
                    path_or_hf_repo=str(model_path),
                    language=args.language,
                    task="transcribe",
                    verbose=False,
                    initial_prompt="Song lyrics. Preserve repeated choruses and avoid adding commentary.",
                )
                plain_lyrics = str(result.get("text", "")).strip()
                if not plain_lyrics:
                    raise RuntimeError("No intelligible lyric text was detected.")
                lyrics_path.parent.mkdir(parents=True, exist_ok=True)
                raw_path = lyrics_path.with_suffix("").with_suffix(".raw.txt")
                raw_path.write_text(plain_lyrics + "\n", encoding="utf-8")
                lyrics_path.write_text(format_structured_lyrics(result) + "\n", encoding="utf-8")
                created.append(lyrics_path)
            except Exception as error:  # Continue so one difficult mix does not stop the library.
                print(f"Could not transcribe {audio_path.name}: {error}", file=sys.stderr)
                failed += 1

    review_path = source / "Lyrics" / "REVIEW_REQUIRED.txt"
    if created:
        review_path.parent.mkdir(parents=True, exist_ok=True)
        review_path.write_text(
            "Review every generated draft against its recording before using it for training.\n"
            "Section labels are suggestions; correct every [Verse], [Chorus], [Bridge], [Intro], and [Outro] label.\n"
            "The accompanying .raw.txt file preserves the plain transcription for comparison.\n\n"
            + "\n".join(str(item.relative_to(source)) for item in created)
            + "\n",
            encoding="utf-8",
        )
    print(
        f"\nFinished: {len(created)} drafts created · {skipped} existing files kept · {failed} could not be transcribed."
    )
    if created:
        print(f"Review list: {review_path}")
    return 2 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
