#!/usr/bin/env python3
"""Realtime webcam: MediaPipe features + optional classifier overlay. Run: python -m ml.scripts.infer_webcam"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# `ml/` must be on path for `infer` / `risk_engine`
ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import cv2
import numpy as np

from infer.baseline import BaselineDrowsinessPipeline, PipelineResult


def probe_capture_fps(cap: cv2.VideoCapture, override: Optional[float]) -> float:
    """Prefer OpenCV metadata; if missing, measure briefly; default 30."""
    if override is not None and override > 0:
        return float(min(120.0, max(1.0, override)))
    meta = cap.get(cv2.CAP_PROP_FPS)
    if meta is not None and meta > 1.0:
        return float(min(120.0, max(1.0, meta)))
    t0 = time.perf_counter()
    n_ok = 0
    for _ in range(90):
        ok, _ = cap.read()
        if not ok:
            break
        n_ok += 1
    elapsed = time.perf_counter() - t0
    if n_ok >= 15 and elapsed > 0.05:
        m = n_ok / elapsed
        if 5.0 <= m <= 120.0:
            return float(m)
    return 30.0


def feature_row_from_pipeline(pr: PipelineResult, columns: List[str]) -> np.ndarray:
    d: Dict[str, float] = {
        "face_ok": float(int(pr.face_detected)),
        "raw_ear": float(pr.raw_ear),
        "raw_mar": float(pr.raw_mar),
    }
    for k, v in pr.blendshape_scores.items():
        d[f"bs_{k}"] = float(v)
    return np.array([[d.get(c, 0.0) for c in columns]], dtype=np.float64)


def classify_with_confidence(bundle: Any, X: np.ndarray) -> Tuple[str, float]:
    model = bundle["model"]
    le = bundle["label_encoder"]
    proba = model.predict_proba(X)[0]
    i = int(np.argmax(proba))
    return str(le.inverse_transform([i])[0]), float(proba[i])


def _label_bgr(label: Optional[str]) -> tuple[int, int, int]:
    if label == "active":
        return (0, 220, 0)
    if label == "yawning":
        return (0, 180, 255)
    if label == "microsleep":
        return (0, 0, 255)
    return (200, 200, 200)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--mock", action="store_true", help="Skip MediaPipe; emit synthetic demo values")
    ap.add_argument(
        "--draw-landmarks",
        action="store_true",
        help="Draw Face Landmarker points on the video (orange = EAR/MAR indices, cyan = rest)",
    )
    ap.add_argument(
        "--fps",
        type=float,
        default=None,
        help="Override effective FPS for temporal thresholds (default: probe camera or 30)",
    )
    ap.add_argument(
        "--classifier",
        type=Path,
        default=None,
        help="joblib from train_state_classifier.py — shows classification + confidence",
    )
    args = ap.parse_args()

    clf_bundle: Any = None
    if args.classifier:
        import joblib

        clf_bundle = joblib.load(args.classifier)

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("Could not open camera", file=sys.stderr)
        sys.exit(1)

    eff_fps = probe_capture_fps(cap, args.fps)
    print(f"Effective FPS (temporal scaling): {eff_fps:.2f}", flush=True)

    pipe: Optional[BaselineDrowsinessPipeline] = None
    if not args.mock:
        pipe = BaselineDrowsinessPipeline(effective_fps=eff_fps)

    win = "Heimdall infer"
    print("Quit: press Q or ESC with the video window focused. On Windows the [X] button often does not stop the loop; use Q/ESC.", flush=True)

    frame_i = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_i += 1

            cls_label: Optional[str] = None
            cls_conf = 0.0
            face_ok = False

            if args.mock:
                phase = (time.time() * 0.7) % 6.0
                face_ok = True
                if clf_bundle:
                    cls_label, cls_conf = None, 0.0
            else:
                assert pipe is not None
                pr = pipe.process_bgr(frame)
                face_ok = pr.face_detected
                if clf_bundle and face_ok:
                    X = feature_row_from_pipeline(pr, clf_bundle["feature_columns"])
                    cls_label, cls_conf = classify_with_confidence(clf_bundle, X)
                if args.draw_landmarks:
                    pipe.draw_landmarks_on(frame)

            if clf_bundle:
                if args.mock:
                    line = "classification: —  (mock has no real features)"
                    color = (180, 180, 180)
                elif not face_ok:
                    line = "classification: —  (no face)"
                    color = (180, 180, 180)
                else:
                    line = f"classification: {cls_label}  ({cls_conf:.2f})"
                    color = _label_bgr(cls_label)
            else:
                line = "Set --classifier path/to/state_clf.joblib"
                color = (0, 220, 255)

            cv2.putText(
                frame,
                line,
                (10, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                color,
                2,
                lineType=cv2.LINE_AA,
            )
            cv2.putText(
                frame,
                "Q or ESC to quit",
                (10, 75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (200, 200, 200),
                1,
                lineType=cv2.LINE_AA,
            )
            cv2.imshow(win, frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                break
            if frame_i > 3:
                try:
                    if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
                        break
                except cv2.error:
                    break
    except KeyboardInterrupt:
        print("\nInterrupted (Ctrl+C).", flush=True)
    finally:
        cap.release()
        cv2.destroyAllWindows()
        try:
            cv2.waitKey(1)
        except cv2.error:
            pass
        if pipe:
            pipe.close()


if __name__ == "__main__":
    main()
