"""
Preprocess Kaggle FL3D dataset for training.

Dataset: https://www.kaggle.com/datasets/matjazmuc/frame-level-driver-drowsiness-detection-fl3d

Steps (manual / Kaggle API):
1. Download archive to ml/data/fl3d_raw/ (see docs/dataset_fl3d.md)
2. Run: python preprocess_fl3d.py --input ml/data/fl3d_raw --output ml/data/fl3d_processed

This scaffold normalizes labels to: alert=0, microsleep=1, yawning=2 (example mapping — adjust to actual CSV columns).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "note": "Placeholder manifest. After extracting FL3D, list frame paths and labels here.",
        "input": str(args.input),
        "frames": [],
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Wrote placeholder manifest. Populate after downloading FL3D.")


if __name__ == "__main__":
    main()
