"""Evaluate checkpoint on FL3D holdout — scaffold."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--manifest", type=Path, default=Path("ml/data/fl3d_processed/manifest.json"))
    args = ap.parse_args()
    meta = {"checkpoint": str(args.checkpoint), "metrics": {"accuracy": None}}
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
