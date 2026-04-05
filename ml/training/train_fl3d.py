"""
Train lightweight temporal classifier on FL3D features (EAR/MAR sequences) or RGB stubs.

For hackathon: default is a small MLP on hand-crafted features exported by preprocess.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=Path, default=Path("ml/data/fl3d_processed/manifest.json"))
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--out", type=Path, default=Path("ml/checkpoints/fl3d_stub.pt"))
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    stub = {
        "epochs": args.epochs,
        "manifest": str(args.manifest),
        "status": "stub_no_data",
    }
    args.out.with_suffix(".json").write_text(json.dumps(stub, indent=2), encoding="utf-8")
    print("Stub training complete. Add FL3D manifest and PyTorch loop for real training.")


if __name__ == "__main__":
    main()
