#!/usr/bin/env python3
"""
Evaluate a trained state classifier on a feature CSV (same format as extract_features_dataset output).

  python -m ml.scripts.test_classifier --classifier ml/checkpoints/state_clf.joblib --csv ml/data/features.csv

Live webcam (same model):

  python -m ml.scripts.infer_webcam --classifier ml/checkpoints/state_clf.joblib
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))


def main() -> None:
    import joblib

    ap = argparse.ArgumentParser()
    ap.add_argument("--classifier", type=Path, required=True)
    ap.add_argument("--csv", type=Path, required=True, help="Feature CSV from extract_features_dataset.py")
    ap.add_argument(
        "--include-no-face",
        action="store_true",
        help="Also include rows with face_ok==0 (default: only face_ok==1)",
    )
    ap.add_argument(
        "--holdout",
        type=float,
        default=0.2,
        help="Fraction for stratified holdout eval (0 = score every row in CSV; use 0 for a val-only CSV)",
    )
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if not args.classifier.is_file():
        print(f"Missing classifier: {args.classifier}", file=sys.stderr)
        sys.exit(1)
    if not args.csv.is_file():
        print(f"Missing CSV: {args.csv}", file=sys.stderr)
        sys.exit(1)

    bundle = joblib.load(args.classifier)
    model = bundle["model"]
    le = bundle["label_encoder"]
    feature_columns = list(bundle["feature_columns"])

    df = pd.read_csv(args.csv)
    if "label" not in df.columns:
        print("CSV must have a 'label' column", file=sys.stderr)
        sys.exit(1)

    missing = [c for c in feature_columns if c not in df.columns]
    if missing:
        print(f"CSV missing columns expected by model: {missing[:5]}...", file=sys.stderr)
        sys.exit(1)

    if not args.include_no_face and "face_ok" in df.columns:
        df = df.loc[df["face_ok"] == 1].copy()
        print(f"Using {len(df)} rows with face_ok==1", flush=True)
    else:
        print(f"Using all {len(df)} rows", flush=True)

    if len(df) < 5:
        print("Too few rows to evaluate.", file=sys.stderr)
        sys.exit(1)

    X = df[feature_columns].fillna(0).to_numpy(dtype=np.float64)
    y = le.transform(df["label"].astype(str).to_numpy())

    if args.holdout and args.holdout > 0:
        strat = y if len(np.unique(y)) > 1 else None
        _X_tr, X_te, _y_tr, y_te = train_test_split(
            X,
            y,
            test_size=args.holdout,
            random_state=args.seed,
            stratify=strat,
        )
        y_pred = model.predict(X_te)
        y_true = y_te
        print(f"Holdout eval: {args.holdout:.0%} of rows (seed={args.seed})", flush=True)
    else:
        y_true = y
        y_pred = model.predict(X)
        print("Eval on all rows in CSV (--holdout 0)", flush=True)

    acc = accuracy_score(y_true, y_pred)
    print(f"Accuracy: {acc:.4f}\n")
    print(classification_report(y_true, y_pred, target_names=list(le.classes_)))


if __name__ == "__main__":
    main()
