#!/usr/bin/env python3
"""Realtime webcam inference + risk scores. Run from repo: python -m ml.scripts.infer_webcam"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

# `ml/` must be on path for `infer` / `risk_engine`
ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import cv2

from infer.baseline import BaselineDrowsinessPipeline
from risk_engine import FrameSignals, RiskConfig, RiskState, load_config_from_yaml, update_risk


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--mock", action="store_true", help="Skip MediaPipe; emit synthetic demo values")
    args = ap.parse_args()

    cfg = load_config_from_yaml()
    state = RiskState()
    pipe = None
    if not args.mock:
        pipe = BaselineDrowsinessPipeline()

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("Could not open camera", file=sys.stderr)
        sys.exit(1)

    t0 = time.time()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            now = time.time() - t0

            if args.mock:
                # Oscillate for demo
                phase = (now * 0.7) % 6.0
                eyes = 0.2 + 0.7 * (1 if phase < 1.5 else 0)
                result_dict = {
                    "face_detected": True,
                    "blink_detected": phase < 0.2,
                    "eyes_closed_score": eyes,
                    "yawn_score": 0.8 if 2 < phase < 2.5 else 0.1,
                    "drowsiness_score": 0.5 * eyes + 0.2,
                    "impairment_risk_score": 0.05 + 0.1 * eyes,
                    "event_labels": ["yawn"] if 2 < phase < 2.5 else [],
                }
            else:
                assert pipe is not None
                pr = pipe.process_bgr(frame)
                result_dict = pr.to_api_dict()
                result_dict["raw_ear"] = pr.raw_ear
                result_dict["raw_mar"] = pr.raw_mar

            sig = FrameSignals(
                timestamp_sec=now,
                face_detected=result_dict["face_detected"],
                eyes_closed_score=result_dict["eyes_closed_score"],
                yawn_score=result_dict["yawn_score"],
                drowsiness_score=result_dict["drowsiness_score"],
                blink_detected=result_dict["blink_detected"],
                prolonged_eye_closure="prolonged_eye_closure" in result_dict.get("event_labels", []),
                microsleep_like="microsleep_like" in result_dict.get("event_labels", []),
                yawn_event="yawn" in result_dict.get("event_labels", []),
                event_labels=list(result_dict.get("event_labels", [])),
            )
            state, dbg = update_risk(state, sig, cfg)

            overlay = f"risk={state.risk:.2f} drow={result_dict['drowsiness_score']:.2f}"
            cv2.putText(frame, overlay, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.imshow("Heimdall infer", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
        if pipe:
            pipe.close()


if __name__ == "__main__":
    main()
