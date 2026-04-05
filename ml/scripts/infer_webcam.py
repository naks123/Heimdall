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
from infer.cumulative_risk import CumulativeRiskTracker
from infer.sleep_beep_gate import RollingMicrosleepBeepGate, play_sleep_warning_beep
from infer.sleep_moment_tracker import RollingMicrosleepMomentTracker
from infer.temporal_classification import TemporalClassificationGate


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


def classify_detailed(bundle: Any, X: np.ndarray) -> Tuple[str, float, Dict[str, float]]:
    """Top label, its probability, and all class probabilities (for temporal gating)."""
    model = bundle["model"]
    le = bundle["label_encoder"]
    p = model.predict_proba(X)[0]
    classes = model.classes_
    k = int(np.argmax(p))
    cid = int(classes[k])
    top = str(le.inverse_transform([cid])[0])
    conf = float(p[k])
    probs = {str(le.inverse_transform([int(classes[j])])[0]): float(p[j]) for j in range(len(classes))}
    return top, conf, probs


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
        "--landmark-fraction",
        type=float,
        default=0.5,
        metavar="F",
        help="Draw this fraction of face mesh points (0=off, 0.5≈half, 1=all). Default: 0.5",
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
    ap.add_argument(
        "--no-temporal-gate",
        action="store_true",
        help="Disable blink vs microsleep temporal gating (raw per-frame classifier only)",
    )
    ap.add_argument(
        "--no-sleep-beep",
        action="store_true",
        help="Disable repeating beeps while 3s rolling mean P(microsleep) is high (stops when < 0.55)",
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
    lf = float(args.landmark_fraction)
    if lf <= 0:
        print("Face landmark overlay: off (--landmark-fraction 0)", flush=True)
    else:
        print(f"Face landmark overlay: {min(1.0, lf) * 100:.0f}% of points", flush=True)

    if clf_bundle and not args.no_temporal_gate:
        print(
            "Temporal gate: microsleep vs blink; yawning vs quick mouth open (sustained + baseline cues).",
            flush=True,
        )
    elif clf_bundle:
        print("Temporal gate: off (--no-temporal-gate)", flush=True)

    sleep_tracker: Optional[RollingMicrosleepMomentTracker] = None
    risk_tracker: Optional[CumulativeRiskTracker] = None
    sleep_beep_gate: Optional[RollingMicrosleepBeepGate] = None
    if clf_bundle:
        sleep_tracker = RollingMicrosleepMomentTracker()
        risk_tracker = CumulativeRiskTracker()
        if not args.no_sleep_beep:
            sleep_beep_gate = RollingMicrosleepBeepGate()
            print(
                "Sleep beep: repeats while 3s mean P(microsleep) stays above 55% after crossing > 60%; stops when mean < 55%. Use --no-sleep-beep to disable.",
                flush=True,
            )
        print(
            "Sleep moments: rolling 2s mean P(microsleep) ≥ 0.50 (count top-right; episodic + rearm < 0.50).",
            flush=True,
        )
        print(
            "Risk score: yawning 1s rolling mean ≥ 0.50 (episodes) × small weight; microsleep 2s rolling mean ≥ 0.50 × larger weight. Active adds 0.",
            flush=True,
        )

    pipe: Optional[BaselineDrowsinessPipeline] = None
    if not args.mock:
        pipe = BaselineDrowsinessPipeline(effective_fps=eff_fps)

    temporal_gate: Optional[TemporalClassificationGate] = None
    if clf_bundle and not args.no_temporal_gate:
        temporal_gate = TemporalClassificationGate(eff_fps)

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
            pr: Optional[PipelineResult] = None
            probs: Optional[Dict[str, float]] = None

            if args.mock:
                face_ok = True
                if clf_bundle:
                    cls_label, cls_conf = None, 0.0
            else:
                assert pipe is not None
                pr = pipe.process_bgr(frame)
                face_ok = pr.face_detected
                if temporal_gate is not None and not face_ok:
                    temporal_gate.reset()
                if clf_bundle and face_ok:
                    X = feature_row_from_pipeline(pr, clf_bundle["feature_columns"])
                    raw_l, raw_c, probs = classify_detailed(clf_bundle, X)
                    if temporal_gate is not None:
                        cls_label, cls_conf = temporal_gate.step(raw_l, raw_c, probs, pr)
                    else:
                        cls_label, cls_conf = raw_l, raw_c
                if lf > 0:
                    pipe.draw_landmarks_on(frame, point_fraction=min(1.0, lf))

            now_sec = time.time()
            if sleep_tracker is not None:
                if face_ok and probs is not None:
                    sleep_tracker.step(now_sec, float(probs.get("microsleep", 0.0)))
                else:
                    sleep_tracker.reset()
            if sleep_beep_gate is not None:
                if face_ok and probs is not None:
                    if sleep_beep_gate.step(now_sec, float(probs.get("microsleep", 0.0))):
                        play_sleep_warning_beep()
                else:
                    sleep_beep_gate.reset()
            if risk_tracker is not None:
                if face_ok and probs is not None:
                    risk_tracker.step(
                        now_sec,
                        float(probs.get("yawning", 0.0)),
                        float(probs.get("microsleep", 0.0)),
                        True,
                    )
                else:
                    risk_tracker.step(now_sec, 0.0, 0.0, False)

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
            if risk_tracker is not None:
                cv2.putText(
                    frame,
                    f"risk: {risk_tracker.total_risk:.3f}",
                    (10, 105),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    (80, 200, 255),
                    2,
                    lineType=cv2.LINE_AA,
                )
            if sleep_tracker is not None:
                h, w = frame.shape[:2]
                sm_line = f"sleep moments: {sleep_tracker.count}"
                font = cv2.FONT_HERSHEY_SIMPLEX
                sm_scale = 0.65
                sm_th = 2
                (sm_tw, sm_th_px), _ = cv2.getTextSize(sm_line, font, sm_scale, sm_th)
                cv2.putText(
                    frame,
                    sm_line,
                    (w - sm_tw - 12, 32),
                    font,
                    sm_scale,
                    (200, 220, 255),
                    sm_th,
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
