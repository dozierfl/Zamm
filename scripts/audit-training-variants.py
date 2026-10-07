#!/usr/bin/env python3
"""Create a non-destructive variant audit for a local music-training library."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

import av
import numpy as np
from scipy.signal import resample_poly

VERSION_SUFFIX = re.compile(r"_(\d+)$")
TARGET_RATE = 8_000
WINDOW_SECONDS = 2
NEAR_DUPLICATE = 0.985
REVIEW_SIMILARITY = 0.90


@dataclass
class AudioItem:
    path: str
    relative_path: str
    base_song: str
    version_number: int
    duration_seconds: float
    sample_rate: int
    channels: int
    checksum: str
    fingerprint: list[float]
    closest_match: str = ""
    similarity: float | None = None
    recommendation: str = "KEEP"
    rationale: str = "No close alternate was detected."


def base_song_and_version(path: Path) -> tuple[str, int]:
    match = VERSION_SUFFIX.search(path.stem)
    if not match:
        return path.stem, 0
    return path.stem[: match.start()], int(match.group(1))


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decode_mono(path: Path) -> tuple[np.ndarray, int, int, float]:
    samples: list[np.ndarray] = []
    with av.open(str(path)) as source:
        stream = next((item for item in source.streams if item.type == "audio"), None)
        if stream is None:
            raise RuntimeError("No audio stream found")
        input_rate = int(stream.rate or 48_000)
        channels = len(stream.codec_context.layout.channels) if stream.codec_context.layout else 1
        resampler = av.audio.resampler.AudioResampler(
            format="flt", layout="mono", rate=TARGET_RATE
        )
        for frame in source.decode(stream):
            for converted in resampler.resample(frame):
                values = converted.to_ndarray().reshape(-1).astype(np.float32, copy=False)
                samples.append(values)
        for converted in resampler.resample(None):
            samples.append(converted.to_ndarray().reshape(-1).astype(np.float32, copy=False))
    if not samples:
        raise RuntimeError("Audio has no decodable samples")
    waveform = np.concatenate(samples)
    return waveform, input_rate, channels, waveform.size / TARGET_RATE


def make_fingerprint(waveform: np.ndarray) -> list[float]:
    window = TARGET_RATE * WINDOW_SECONDS
    count = max(1, math.ceil(waveform.size / window))
    padded = np.pad(waveform, (0, count * window - waveform.size))
    chunks = padded.reshape(count, window)
    rms = np.sqrt(np.mean(np.square(chunks), axis=1) + 1e-12)
    log_rms = np.log(rms + 1e-6)
    # A fixed-length normalized energy shape makes same-song masters compare
    # strongly even if gain changes, while different arrangements remain apart.
    position = np.linspace(0, max(0, log_rms.size - 1), 96)
    fingerprint = np.interp(position, np.arange(log_rms.size), log_rms)
    fingerprint -= fingerprint.mean()
    norm = np.linalg.norm(fingerprint)
    if norm:
        fingerprint /= norm
    return [round(float(value), 8) for value in fingerprint]


def similarity(left: AudioItem, right: AudioItem) -> float:
    duration_ratio = min(left.duration_seconds, right.duration_seconds) / max(
        left.duration_seconds, right.duration_seconds
    )
    if duration_ratio < 0.94:
        return -1.0
    return float(np.dot(np.array(left.fingerprint), np.array(right.fingerprint)))


def preferred(items: list[AudioItem]) -> AudioItem:
    return min(
        items,
        key=lambda item: (0 if item.version_number == 0 else 1, item.version_number, item.relative_path.casefold()),
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Flag likely duplicate music versions without changing any source audio."
    )
    parser.add_argument("directory", type=Path, help="Folder containing WAV training candidates.")
    parser.add_argument(
        "--output",
        type=Path,
        help="Report directory. Defaults to a sibling variant-audit folder.",
    )
    args = parser.parse_args()
    source = args.directory.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Folder not found: {source}")
    output = (args.output or source.parent / "variant-audit").expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)

    files = sorted(item for item in source.rglob("*.wav") if item.is_file())
    if not files:
        raise SystemExit(f"No WAV files found in: {source}")

    groups: dict[str, list[AudioItem]] = defaultdict(list)
    print(f"Auditing {len(files)} WAV files. Source files will not be changed.")
    for index, path in enumerate(files, start=1):
        base_song, version = base_song_and_version(path)
        print(f"[{index}/{len(files)}] {path.name}")
        waveform, sample_rate, channels, duration = decode_mono(path)
        item = AudioItem(
            path=str(path),
            relative_path=str(path.relative_to(source)),
            base_song=base_song,
            version_number=version,
            duration_seconds=round(duration, 3),
            sample_rate=sample_rate,
            channels=channels,
            checksum=checksum(path),
            fingerprint=make_fingerprint(waveform),
        )
        groups[base_song.casefold()].append(item)

    rows: list[AudioItem] = []
    report_groups: list[dict[str, object]] = []
    for items in sorted(groups.values(), key=lambda group: preferred(group).base_song.casefold()):
        pairs: list[tuple[float, AudioItem, AudioItem]] = []
        for index, left in enumerate(items):
            for right in items[index + 1 :]:
                score = similarity(left, right)
                if score >= REVIEW_SIMILARITY:
                    pairs.append((score, left, right))
        duplicate_members: set[str] = set()
        for score, left, right in sorted(pairs, reverse=True, key=lambda pair: pair[0]):
            keeper = preferred([left, right])
            other = right if keeper is left else left
            if score >= NEAR_DUPLICATE:
                other.recommendation = "LIKELY_DUPLICATE"
                other.rationale = f"{score:.1%} energy-shape match to {keeper.relative_path}. Keep one after listening."
                other.closest_match = keeper.relative_path
                other.similarity = round(score, 5)
                duplicate_members.add(other.relative_path)
            elif other.relative_path not in duplicate_members and other.recommendation == "KEEP":
                other.recommendation = "REVIEW_VARIANT"
                other.rationale = f"{score:.1%} structural similarity to {keeper.relative_path}. Keep both if the arrangement or performance is meaningfully different."
                other.closest_match = keeper.relative_path
                other.similarity = round(score, 5)
        rows.extend(items)
        report_groups.append(
            {
                "baseSong": preferred(items).base_song,
                "fileCount": len(items),
                "recommendedDefault": preferred(items).relative_path,
                "comparisons": [
                    {
                        "similarity": round(score, 5),
                        "left": left.relative_path,
                        "right": right.relative_path,
                    }
                    for score, left, right in sorted(pairs, reverse=True, key=lambda pair: pair[0])
                ],
            }
        )

    csv_path = output / "variant-audit.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=[
                "base_song",
                "version_number",
                "relative_path",
                "duration_seconds",
                "sample_rate",
                "channels",
                "recommendation",
                "similarity",
                "closest_match",
                "rationale",
                "checksum",
            ],
        )
        writer.writeheader()
        for item in sorted(rows, key=lambda value: (value.base_song.casefold(), value.version_number, value.relative_path.casefold())):
            writer.writerow(
                {
                    "base_song": item.base_song,
                    "version_number": item.version_number,
                    "relative_path": item.relative_path,
                    "duration_seconds": item.duration_seconds,
                    "sample_rate": item.sample_rate,
                    "channels": item.channels,
                    "recommendation": item.recommendation,
                    "similarity": item.similarity or "",
                    "closest_match": item.closest_match,
                    "rationale": item.rationale,
                    "checksum": item.checksum,
                }
            )

    json_path = output / "variant-audit.json"
    json_path.write_text(
        json.dumps(
            {
                "sourceDirectory": str(source),
                "nearDuplicateThreshold": NEAR_DUPLICATE,
                "reviewThreshold": REVIEW_SIMILARITY,
                "items": [asdict(item) for item in rows],
                "groups": report_groups,
                "notes": [
                    "LIKELY_DUPLICATE flags matching energy shapes, not a deletion instruction.",
                    "Keep every musically distinct version, including alternate arrangements and performances.",
                    "Review audio before admitting it to a training run.",
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    summary = {label: sum(item.recommendation == label for item in rows) for label in ("KEEP", "REVIEW_VARIANT", "LIKELY_DUPLICATE")}
    print("\nAudit complete.")
    print(f"{len(rows)} files · {len(groups)} song groups")
    print(" · ".join(f"{count} {label.lower()}" for label, count in summary.items()))
    print(f"CSV: {csv_path}")
    print(f"JSON: {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
