from __future__ import annotations

import argparse
import json
import random
from pathlib import Path


def complete_names(experiment: Path) -> list[str]:
    layouts = {
        "0_gt_wavs": lambda name: f"{name}.wav",
        "1_16k_wavs": lambda name: f"{name}.wav",
        "2a_f0": lambda name: f"{name}.wav.npy",
        "2b-f0nsf": lambda name: f"{name}.wav.npy",
        "3_feature768": lambda name: f"{name}.npy",
    }
    names = {path.stem for path in (experiment / "0_gt_wavs").glob("*.wav")}
    for directory, filename in layouts.items():
        names &= {
            name
            for name in names
            if (experiment / directory / filename(name)).is_file()
        }
    return sorted(names)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rvc-root", type=Path, required=True)
    parser.add_argument("--experiment", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260908)
    args = parser.parse_args()

    root = args.rvc_root.resolve()
    experiment = root / "logs" / args.experiment
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    names = complete_names(experiment)
    if not names:
        raise RuntimeError("No complete RVC training examples were found")

    lines = [
        "|".join(
            [
                str(experiment / "0_gt_wavs" / f"{name}.wav"),
                str(experiment / "3_feature768" / f"{name}.npy"),
                str(experiment / "2a_f0" / f"{name}.wav.npy"),
                str(experiment / "2b-f0nsf" / f"{name}.wav.npy"),
                "0",
            ]
        )
        for name in names
    ]
    random.Random(args.seed).shuffle(lines)
    (experiment / "filelist.txt").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )

    config = json.loads((root / "configs" / "v1" / "40k.json").read_text())
    (experiment / "config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=4, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    provenance = {
        "profile": manifest["profile"],
        "profile_version": manifest["versionNumber"],
        "source_manifest_checksum": manifest["sourceManifestChecksum"],
        "approved_source_count": manifest["selectedSourceCount"],
        "approved_usable_seconds": manifest["selectedUsableSeconds"],
        "preprocessed_training_examples": len(names),
        "shuffle_seed": args.seed,
    }
    (experiment / "dozi-training-provenance.json").write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Prepared {len(names)} complete examples in {experiment}")


if __name__ == "__main__":
    main()
