#!/usr/bin/env python3
"""Webcam or video file: MediaPipe features + optional classifier overlay.

Examples:
  python -m ml.scripts.infer_webcam --classifier model.joblib
  python -m ml.scripts.infer_webcam --classifier model.joblib --video clip.mov -o clip_overlay.mov
"""
from __future__ import annotations

import argparse
import os
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


def probe_file_fps(cap: cv2.VideoCapture, override: Optional[float]) -> float:
    """FPS from file metadata only (does not consume frames). Default 30 if unknown."""
    if override is not None and override > 0:
        return float(min(120.0, max(1.0, override)))
    meta = cap.get(cv2.CAP_PROP_FPS)
    if meta is not None and meta > 1.0:
        return float(min(120.0, max(1.0, meta)))
    return 30.0


def open_video_writer(out_path: Path, width: int, height: int, fps: float) -> cv2.VideoWriter:
    """Try a few codecs so .mov / .mp4 works across OpenCV builds."""
    out_path = out_path.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ext = out_path.suffix.lower()
    fourcc_candidates: List[str]
    if ext in (".mov", ".mp4", ".m4v", ".mkv"):
        fourcc_candidates = ["avc1", "mp4v", "H264", "X264"]
    else:
        fourcc_candidates = ["MJPG", "XVID", "mp4v"]
    size = (int(width), int(height))
    fps_w = float(min(120.0, max(1.0, fps)))
    for cc in fourcc_candidates:
        c4 = (cc + "    ")[:4]
        fourcc = cv2.VideoWriter_fourcc(c4[0], c4[1], c4[2], c4[3])
        w = cv2.VideoWriter(str(out_path), fourcc, fps_w, size)
        if w.isOpened():
            print(f"Video writer: fourcc={cc!r} -> {out_path}", flush=True)
            return w
    print("Could not open VideoWriter with any codec; try .mp4 or install OpenCV with ffmpeg.", file=sys.stderr)
    raise SystemExit(1)


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


def load_classifier_bundle(explicit: Optional[Path]) -> Any:
    """
    Load sklearn joblib from --classifier, HEIMDALL_CLASSIFIER, or the first of the
    default names under ml/checkpoints/. Without a bundle, state labels and risk stay off.
    """
    import joblib

    if explicit is not None:
        p = explicit.resolve()
        if not p.is_file():
            print(f"Classifier not found: {p}", file=sys.stderr)
            sys.exit(1)
        print(f"Loading classifier: {p}", flush=True)
        return joblib.load(p)

    env = os.environ.get("HEIMDALL_CLASSIFIER", "").strip()
    if env:
        p = Path(env).expanduser().resolve()
        if p.is_file():
            print(f"Loading classifier (HEIMDALL_CLASSIFIER): {p}", flush=True)
            return joblib.load(p)
        print(f"HEIMDALL_CLASSIFIER set but file not found: {p}", file=sys.stderr)
        sys.exit(1)

    ckpt = ML_DIR / "checkpoints"
    for name in (
        "state_clf.joblib",
        "state_clf_4sessions.joblib",
        "state_clf_3sessions.joblib",
        "state_clf_one_session.joblib",
    ):
        p = ckpt / name
        if p.is_file():
            print(f"Loading default classifier: {p}", flush=True)
            return joblib.load(p)

    return None


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
        metavar="PATH",
        help=(
            "sklearn joblib (train_state_classifier.py). If omitted, tries ml/checkpoints/state_clf.joblib "
            "then other state_clf_*.joblib, or env HEIMDALL_CLASSIFIER. Required for state + risk overlay."
        ),
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
    ap.add_argument(
        "--video",
        type=Path,
        default=None,
        metavar="PATH",
        help="Input video (.mov, .mp4, …) instead of live camera; requires --output / -o",
    )
    ap.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        metavar="PATH",
        help="Write overlaid video (use with --video)",
    )
    ap.add_argument(
        "--video-preview",
        action="store_true",
        help="With --video, show a live preview window while encoding (slower)",
    )
    args = ap.parse_args()

    if args.video is not None and args.output is None:
        print("--video requires --output (or -o) for the overlaid file", file=sys.stderr)
        sys.exit(2)
    if args.output is not None and args.video is None:
        print("--output only applies with --video", file=sys.stderr)
        sys.exit(2)

    clf_bundle: Any = load_classifier_bundle(args.classifier)
    if clf_bundle is None:
        print(
            "No classifier loaded: overlay will show landmarks only (no state labels or risk). "
            "Train one with ml/training/train_state_classifier.py, save to ml/checkpoints/state_clf.joblib, "
            "or pass --classifier PATH / set HEIMDALL_CLASSIFIER.",
            file=sys.stderr,
            flush=True,
        )

    if args.video is not None:
        vpath = args.video.resolve()
        if not vpath.is_file():
            print(f"Video not found: {vpath}", file=sys.stderr)
            sys.exit(1)
        cap = cv2.VideoCapture(str(vpath))
        if not cap.isOpened():
            print(f"Could not open video: {vpath}", file=sys.stderr)
            sys.exit(1)
        eff_fps = probe_file_fps(cap, args.fps)
    else:
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
        if not args.no_sleep_beep and args.video is None:
            sleep_beep_gate = RollingMicrosleepBeepGate()
            print(
                "Sleep beep: repeats while 3s mean P(microsleep) stays above 55% after crossing > 60%; stops when mean < 55%. Use --no-sleep-beep to disable.",
                flush=True,
            )
        print(
            "Sleep moments: rolling 2s mean P(microsleep) >= 0.50 (count top-right; episodic + rearm < 0.50).",
            flush=True,
        )
        print(
            "Risk index: yawning 1s rolling mean >= 0.50 (episodes) x small weight; microsleep 2s rolling mean >= 0.50 x larger weight. Active adds 0. Shown as 0-1 vs session time.",
            flush=True,
        )

    pipe: Optional[BaselineDrowsinessPipeline] = None
    if not args.mock:
        pipe = BaselineDrowsinessPipeline(effective_fps=eff_fps)

    temporal_gate: Optional[TemporalClassificationGate] = None
    if clf_bundle and not args.no_temporal_gate:
        temporal_gate = TemporalClassificationGate(eff_fps)

    if args.video is not None:
        print(
            "Video file mode: timeline uses frame index / FPS for sleep, risk, and gates (not wall clock). Beep disabled.",
            flush=True,
        )

    win = "Heimdall infer"
    if args.video is None:
        print(
            "Quit: press Q or ESC with the video window focused. On Windows the [X] button often does not stop the loop; use Q/ESC.",
            flush=True,
        )
    else:
        print(f"Writing overlaid video -> {args.output.resolve()}", flush=True)

    risk_clock_t0 = time.time()
    use_media_time = args.video is not None
    writer: Optional[cv2.VideoWriter] = None
    frame_i = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if frame.ndim == 2:
                frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
            if use_media_time:
                now_sec = frame_i / eff_fps
                elapsed_sess = now_sec
            else:
                now_sec = time.time()
                elapsed_sess = now_sec - risk_clock_t0
            frame_i += 1

            if args.video is not None and writer is None:
                fh, fw = frame.shape[:2]
                writer = open_video_writer(args.output, fw, fh, eff_fps)

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

            last_norm = risk_tracker.normalized_risk_01(elapsed_sess) if risk_tracker is not None else 0.0

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
            footer = f"frame {frame_i}" if args.video is not None else "Q or ESC to quit"
            cv2.putText(
                frame,
                footer,
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
                    f"risk (0-1 vs time): {last_norm:.3f}",
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
            if writer is not None:
                writer.write(frame)
            show_ui = args.video is None or args.video_preview
            if show_ui:
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
            elif args.video is not None and frame_i % 120 == 0:
                print(f"  encoded {frame_i} frames ...", flush=True)
    except KeyboardInterrupt:
        print("\nInterrupted (Ctrl+C).", flush=True)
    finally:
        if writer is not None:
            writer.release()
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
