#!/usr/bin/env python3
"""
Walk labeled images, run MediaPipe (IMAGE mode), write a feature CSV for sklearn.

Layouts:

  class-folders (default when no per-folder JSON found under --data-dir):
    DATA_ROOT/active/*.jpg
    DATA_ROOT/yawning/*.jpg
    DATA_ROOT/microsleep/*.jpg

  single-session — --data-dir is one session folder that contains annotations_final.json
    Example: --data-dir ml/data/classification_frames/P1042756_720

  folder-json — each immediate subfolder has annotations_final.json mapping
    "frame123.jpg" -> {"driver_state": "alert"|"yawning"|"microsleep", ...}
    Example: --data-dir ml/data/classification_frames

  split-json — one JSON (train/val/test/all) with path keys like
    "./classification_frames/P1043127_720/frame461.jpg"
    Example: --layout split-json --split-json ml/data/classification_frames/annotations_train.json
             --frames-root ml/data/classification_frames

  python -m ml.scripts.extract_features_dataset --data-dir ml/data/classification_frames --out-csv ml/data/features.csv

  Multiple session folders (each must contain annotations_final.json + jpgs):

  python -m ml.scripts.extract_features_dataset \\
    --session-folder ml/data/classification_frames/P1042762_720 \\
    --session-folder ml/data/classification_frames/P1042767_720 \\
    --session-folder ml/data/classification_frames/P1042787_720 \\
    --out-csv ml/data/features_3sess.csv
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import List, Set, Tuple

import cv2
import pandas as pd
from tqdm import tqdm

ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from infer.image_features import StaticImageLandmarker, row_to_flat_dict

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def normalize_driver_state(raw: str, alert_as: str) -> str:
    r = (raw or "").strip().lower()
    if r == "alert":
        return alert_as
    return r


def detect_layout(data_dir: Path, json_name: str) -> str:
    if (data_dir / json_name).is_file():
        return "single-session"
    for p in data_dir.iterdir():
        if p.is_dir() and (p / json_name).is_file():
            return "folder-json"
    return "class-folders"


def _safe_json_image_key(fname: str) -> bool:
    """JSON keys must be plain filenames under the session folder (no paths)."""
    if not fname or not isinstance(fname, str):
        return False
    if "/" in fname or "\\" in fname or fname.startswith("."):
        return False
    p = Path(fname)
    if p.is_absolute() or p.name != fname:
        return False
    return True


def iter_session_dir(session_dir: Path, json_name: str, alert_as: str) -> List[Tuple[str, Path]]:
    """One folder containing json_name + image files; each JSON key is a filename in that folder."""
    out: List[Tuple[str, Path]] = []
    ann_path = session_dir / json_name
    if not ann_path.is_file():
        return out
    data = json.loads(ann_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return out
    for fname, meta in data.items():
        if not _safe_json_image_key(str(fname)):
            continue
        if not isinstance(meta, dict):
            continue
        raw = meta.get("driver_state") or meta.get("state") or meta.get("label")
        if raw is None:
            continue
        label = normalize_driver_state(str(raw), alert_as)
        path = (session_dir / fname).resolve()
        try:
            path.relative_to(session_dir.resolve())
        except ValueError:
            continue
        if path.suffix.lower() not in IMAGE_EXT:
            continue
        out.append((label, path))
    return out


def iter_class_folders(data_root: Path) -> List[Tuple[str, Path]]:
    out: List[Tuple[str, Path]] = []
    for class_dir in sorted(data_root.iterdir()):
        if not class_dir.is_dir():
            continue
        label = class_dir.name
        for p in sorted(class_dir.rglob("*")):
            if p.suffix.lower() in IMAGE_EXT:
                out.append((label, p))
    return out


def iter_folder_json(
    data_root: Path,
    json_name: str,
    alert_as: str,
) -> List[Tuple[str, Path]]:
    out: List[Tuple[str, Path]] = []
    for session_dir in sorted(data_root.iterdir()):
        if not session_dir.is_dir():
            continue
        out.extend(iter_session_dir(session_dir, json_name, alert_as))
    return out


def resolve_split_json_key(key: str, frames_root: Path) -> Path:
    """Map './classification_frames/P1043127_720/frame.jpg' -> frames_root / P1043127_720 / frame.jpg"""
    k = key.replace("\\", "/").lstrip("./")
    marker = "classification_frames/"
    if marker in k:
        rel = k.split(marker, 1)[1]
    elif k.startswith("classification_frames/"):
        rel = k[len("classification_frames/") :]
    else:
        rel = Path(k).name
        # last resort: basename only is ambiguous; try under frames_root rglob — skip
        return frames_root / k if not k.startswith("/") else Path(k)
    return frames_root / rel


def iter_split_json(
    split_json: Path,
    frames_root: Path,
    alert_as: str,
) -> List[Tuple[str, Path]]:
    data = json.loads(split_json.read_text(encoding="utf-8"))
    out: List[Tuple[str, Path]] = []
    for key, meta in data.items():
        if not isinstance(meta, dict):
            continue
        raw = meta.get("driver_state") or meta.get("state") or meta.get("label")
        if raw is None:
            continue
        label = normalize_driver_state(str(raw), alert_as)
        path = resolve_split_json_key(str(key), frames_root)
        if path.suffix.lower() not in IMAGE_EXT:
            continue
        out.append((label, path))
    return out


def probe_blendshape_keys(
    samples: List[Tuple[str, Path]], landmarker: StaticImageLandmarker, max_probe: int
) -> List[str]:
    keys: Set[str] = set()
    n = 0
    for _, path in samples:
        if n >= max_probe:
            break
        bgr = cv2.imread(str(path))
        if bgr is None:
            continue
        row = landmarker.process_bgr(bgr, str(path))
        if row.face_detected:
            keys.update(row.blendshape_scores.keys())
            n += 1
    return sorted(keys)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Root for class-folders / folder-json / single-session (not used with --session-folder or split-json).",
    )
    ap.add_argument(
        "--session-folder",
        action="append",
        default=None,
        metavar="DIR",
        help="Session directory containing --json-name and images; repeat for multiple sessions (labels from JSON).",
    )
    ap.add_argument("--out-csv", type=Path, required=True)
    ap.add_argument("--probe", type=int, default=250, help="Max faces to scan for blendshape key names")
    ap.add_argument(
        "--layout",
        choices=("auto", "class-folders", "folder-json", "single-session", "split-json"),
        default="auto",
        help="auto: single-session if --json-name is in --data-dir; else folder-json / class-folders",
    )
    ap.add_argument("--json-name", type=str, default="annotations_final.json")
    ap.add_argument(
        "--split-json",
        type=Path,
        default=None,
        help="With layout=split-json: path to annotations_train.json (or val/test/all)",
    )
    ap.add_argument(
        "--frames-root",
        type=Path,
        default=None,
        help="With split-json: directory that contains P104xxxx_720/... (e.g. ml/data/classification_frames)",
    )
    ap.add_argument(
        "--alert-as",
        type=str,
        default="active",
        help="Rename dataset label 'alert' to this (default active, for 3-class demo naming)",
    )
    ap.add_argument(
        "--max-samples",
        type=int,
        default=0,
        help="After building the manifest, shuffle and cap at N rows (0 = use all). Useful for quick runs.",
    )
    ap.add_argument("--seed", type=int, default=42, help="RNG seed when --max-samples is set")
    args = ap.parse_args()
    session_folders = list(args.session_folder or [])

    if args.layout == "split-json":
        if args.split_json is None or not args.split_json.is_file():
            print("--layout split-json requires existing --split-json file", file=sys.stderr)
            sys.exit(1)
        if args.frames_root is None or not args.frames_root.is_dir():
            print("--layout split-json requires --frames-root (e.g. ml/data/classification_frames)", file=sys.stderr)
            sys.exit(1)
        samples = iter_split_json(args.split_json, args.frames_root, args.alert_as)
    elif session_folders:
        samples = []
        for sf in session_folders:
            sd = Path(sf)
            if not sd.is_dir():
                print(f"Not a directory: {sd}", file=sys.stderr)
                sys.exit(1)
            ann = sd / args.json_name
            if not ann.is_file():
                print(f"Missing {args.json_name} in {sd}", file=sys.stderr)
                sys.exit(1)
            part = iter_session_dir(sd, args.json_name, args.alert_as)
            print(f"  {sd.name}: {len(part)} entries from JSON", flush=True)
            samples.extend(part)
        print(f"Combined {len(session_folders)} session folder(s) -> {len(samples)} labeled paths", flush=True)
    else:
        if args.data_dir is None or not args.data_dir.is_dir():
            print("Need --data-dir, or use --session-folder (repeatable), or --layout split-json.", file=sys.stderr)
            sys.exit(1)
        layout = args.layout
        if layout == "auto":
            layout = detect_layout(args.data_dir, args.json_name)
            print(f"Detected layout: {layout}", flush=True)
        if layout == "single-session":
            samples = iter_session_dir(args.data_dir, args.json_name, args.alert_as)
        elif layout == "folder-json":
            samples = iter_folder_json(args.data_dir, args.json_name, args.alert_as)
        else:
            samples = iter_class_folders(args.data_dir)

    if not samples:
        print("No labeled image paths found. Check --layout, paths, and JSON structure.", file=sys.stderr)
        sys.exit(1)

    if args.max_samples and args.max_samples > 0 and len(samples) > args.max_samples:
        rng = random.Random(args.seed)
        rng.shuffle(samples)
        samples = samples[: args.max_samples]
        print(f"Using random subset: {len(samples)} samples (seed={args.seed})", flush=True)

    missing = sum(1 for _, p in samples if not p.is_file())
    if missing:
        print(f"Warning: {missing} paths in manifest are missing on disk (skipped during read).", file=sys.stderr)

    lm = StaticImageLandmarker()
    try:
        bs_order = probe_blendshape_keys(samples, lm, args.probe)
        if not bs_order:
            print(
                "Warning: no blendshape keys in probe set; CSV will only have EAR/MAR. "
                "Increase --probe or check images show a face.",
                file=sys.stderr,
            )

        rows_out: List[dict] = []
        for label, path in tqdm(samples, desc="extract"):
            if not path.is_file():
                continue
            bgr = cv2.imread(str(path))
            if bgr is None:
                continue
            row = lm.process_bgr(bgr, str(path))
            flat = row_to_flat_dict(row, bs_order)
            flat["label"] = label
            rows_out.append(flat)

        args.out_csv.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(rows_out).to_csv(args.out_csv, index=False)
        print(f"Wrote {len(rows_out)} rows to {args.out_csv} ({len(bs_order)} blendshape columns)")
    finally:
        lm.close()


if __name__ == "__main__":
    main()
