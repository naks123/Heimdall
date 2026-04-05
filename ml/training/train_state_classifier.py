"""
Train a 3-class sklearn classifier on extract_features_dataset.py CSV.

  python -m ml.training.train_state_classifier --csv ml/data/features.csv --out ml/checkpoints/state_clf.joblib

Bundle contains: model, label_encoder, feature_columns (for realtime inference).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("ml/checkpoints/state_clf.joblib"))
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    if "label" not in df.columns:
        raise SystemExit("CSV must have a 'label' column")

    drop_cols = {"label", "path"}
    feature_columns = [c for c in df.columns if c not in drop_cols]
    mask = df["face_ok"] == 1 if "face_ok" in df.columns else np.ones(len(df), dtype=bool)
    df_fit = df.loc[mask].copy()
    if len(df_fit) < 10:
        print("Very few rows with face_ok=1; training on all rows (expect noise).")
        df_fit = df.copy()

    X = df_fit[feature_columns].fillna(0).to_numpy(dtype=np.float64)
    y_raw = df_fit["label"].astype(str).to_numpy()

    le = LabelEncoder()
    y = le.fit_transform(y_raw)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y if len(np.unique(y)) > 1 else None
    )

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=2,
        random_state=args.seed,
        class_weight="balanced_subsample",
    )
    clf.fit(X_train, y_train)
    pred = clf.predict(X_test)
    print(classification_report(y_test, pred, target_names=le.classes_))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "model": clf,
        "label_encoder": le,
        "feature_columns": feature_columns,
        "classes": list(le.classes_),
    }
    joblib.dump(bundle, args.out)
    meta = {
        "model_type": "RandomForestClassifier",
        "feature_columns": feature_columns,
        "classes": list(le.classes_),
    }
    (args.out.with_suffix(".meta.json")).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved {args.out}")


if __name__ == "__main__":
    main()
