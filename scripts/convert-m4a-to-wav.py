#!/usr/bin/env python3
"""Convert M4A files to 24-bit PCM WAV copies using Dozi's local PyAV stack."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import av


def convert(input_path: Path, output_path: Path) -> None:
    partial_path = output_path.with_suffix(output_path.suffix + ".dozi-partial")
    if partial_path.exists():
        raise RuntimeError(
            f"A previous partial conversion exists: {partial_path.name}. "
            "Move it aside, then run the converter again."
        )
    with av.open(str(input_path)) as source:
        input_stream = next(
            (stream for stream in source.streams if stream.type == "audio"), None
        )
        if input_stream is None:
            raise RuntimeError("No audio stream was found.")
        sample_rate = int(input_stream.rate or 44100)
        layout = (
            input_stream.codec_context.layout.name
            if input_stream.codec_context.layout
            else "stereo"
        )
        with av.open(str(partial_path), "w", format="wav") as destination:
            output_stream = destination.add_stream("pcm_s24le", rate=sample_rate)
            output_stream.layout = layout
            resampler = av.audio.resampler.AudioResampler(
                format="s32", layout=layout, rate=sample_rate
            )
            for frame in source.decode(input_stream):
                for converted in resampler.resample(frame):
                    for packet in output_stream.encode(converted):
                        destination.mux(packet)
            for converted in resampler.resample(None):
                for packet in output_stream.encode(converted):
                    destination.mux(packet)
            for packet in output_stream.encode(None):
                destination.mux(packet)
    if partial_path.stat().st_size <= 44:
        raise RuntimeError("The WAV output was empty.")
    partial_path.replace(output_path)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create 24-bit WAV copies of M4A files without changing originals."
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=Path.cwd(),
        type=Path,
        help="Song folder to convert. Defaults to the current folder.",
    )
    args = parser.parse_args()
    source_dir = args.directory.expanduser().resolve()
    if not source_dir.is_dir():
        print(f"Folder not found: {source_dir}", file=sys.stderr)
        return 1

    output_dir = source_dir / "WAV"
    inputs = [
        item
        for item in source_dir.rglob("*")
        if item.is_file()
        and item.suffix.lower() == ".m4a"
        and "WAV" not in item.relative_to(source_dir).parts
    ]
    if not inputs:
        print(f"No M4A files were found in: {source_dir}", file=sys.stderr)
        return 1

    converted = skipped = failed = 0
    print(f"Creating 24-bit WAV copies in: {output_dir}")
    print("Your M4A originals will not be changed.\n")
    for input_path in sorted(inputs):
        relative = input_path.relative_to(source_dir)
        output_path = output_dir / relative.with_suffix(".wav")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if output_path.exists():
            print(f"Already exists — skipping: {relative}")
            skipped += 1
            continue
        print(f"Converting: {relative}")
        try:
            convert(input_path, output_path)
            converted += 1
        except (av.error.FFmpegError, OSError, RuntimeError) as error:
            print(f"Could not convert: {relative}\n  {error}", file=sys.stderr)
            failed += 1

    print(
        f"\nFinished: {converted} converted · {skipped} already existed · {failed} failed"
    )
    print(f"WAV copies: {output_dir}")
    return 2 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
