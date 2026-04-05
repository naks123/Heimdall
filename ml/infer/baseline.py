"""
MediaPipe Face Mesh + EAR / MAR heuristics + temporal smoothing.
Works without trained weights; optional classifier hook for FL3D-trained head.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:
    mp = None  # type: ignore


# Eye landmark indices (Face Mesh) — approximate vertical pairs for EAR
LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
MOUTH_INDICES = [61, 291, 0, 17, 269, 409]  # outer mouth for MAR


def _euclidean(p1: np.ndarray, p2: np.ndarray) -> float:
    return float(np.linalg.norm(p1 - p2))


def eye_aspect_ratio(pts: np.ndarray) -> float:
    """Standard EAR from 6 points."""
    if pts.shape[0] != 6:
        return 0.0
    v1 = _euclidean(pts[1], pts[5])
    v2 = _euclidean(pts[2], pts[4])
    h = _euclidean(pts[0], pts[3])
    if h < 1e-6:
        return 0.0
    return (v1 + v2) / (2.0 * h)


def mouth_aspect_ratio(pts: np.ndarray) -> float:
    if pts.shape[0] < 4:
        return 0.0
    h = _euclidean(pts[0], pts[3])
    v = _euclidean(pts[1], pts[2])
    if h < 1e-6:
        return 0.0
    return v / h


@dataclass
class PipelineResult:
    face_detected: bool
    blink_detected: bool
    eyes_closed_score: float
    yawn_score: float
    drowsiness_score: float
    impairment_risk_score: float
    event_labels: List[str]
    raw_ear: float
    raw_mar: float

    def to_api_dict(self) -> Dict[str, Any]:
        return {
            "face_detected": self.face_detected,
            "blink_detected": self.blink_detected,
            "eyes_closed_score": round(self.eyes_closed_score, 4),
            "yawn_score": round(self.yawn_score, 4),
            "drowsiness_score": round(self.drowsiness_score, 4),
            "impairment_risk_score": round(self.impairment_risk_score, 4),
            "event_labels": list(self.event_labels),
        }


class BaselineDrowsinessPipeline:
    def __init__(
        self,
        ear_closed_thresh: float = 0.18,
        ear_open_thresh: float = 0.22,
        mar_yawn_thresh: float = 0.38,
        seq_len: int = 8,
    ):
        if mp is None:
            raise RuntimeError("mediapipe is required. pip install mediapipe")
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.ear_closed_thresh = ear_closed_thresh
        self.ear_open_thresh = ear_open_thresh
        self.mar_yawn_thresh = mar_yawn_thresh
        self.seq_len = seq_len
        self._ear_hist: List[float] = []
        self._mar_hist: List[float] = []
        self._closed_frames = 0
        self._blink_cooldown = 0
        self._prev_ear: Optional[float] = None

    def _landmarks_to_np(self, lm, w: int, h: int, indices: List[int]) -> np.ndarray:
        return np.array([[lm[i].x * w, lm[i].y * h] for i in indices], dtype=np.float64)

    def process_bgr(self, frame_bgr: np.ndarray) -> PipelineResult:
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        out = self.face_mesh.process(rgb)
        event_labels: List[str] = []

        if not out.multi_face_landmarks:
            return PipelineResult(
                face_detected=False,
                blink_detected=False,
                eyes_closed_score=0.0,
                yawn_score=0.0,
                drowsiness_score=0.0,
                impairment_risk_score=0.0,
                event_labels=[],
                raw_ear=0.0,
                raw_mar=0.0,
            )

        lm = out.multi_face_landmarks[0].landmark
        left = self._landmarks_to_np(lm, w, h, LEFT_EYE_INDICES)
        right = self._landmarks_to_np(lm, w, h, RIGHT_EYE_INDICES)
        mouth = self._landmarks_to_np(lm, w, h, MOUTH_INDICES)

        ear_l = eye_aspect_ratio(left)
        ear_r = eye_aspect_ratio(right)
        ear = (ear_l + ear_r) / 2.0
        mar = mouth_aspect_ratio(mouth[:4])

        self._ear_hist.append(ear)
        self._ear_hist = self._ear_hist[-self.seq_len :]
        self._mar_hist.append(mar)
        self._mar_hist = self._mar_hist[-self.seq_len :]

        # Eyes closed score from EAR (higher EAR = more open)
        eyes_open = np.clip((ear - self.ear_closed_thresh) / max(1e-6, self.ear_open_thresh - self.ear_closed_thresh), 0, 1)
        eyes_closed_score = float(1.0 - eyes_open)

        # Blink: rapid drop in EAR
        blink_detected = False
        if self._prev_ear is not None and self._prev_ear > self.ear_open_thresh and ear < self.ear_closed_thresh:
            if self._blink_cooldown <= 0:
                blink_detected = True
                self._blink_cooldown = 8
                event_labels.append("blink")
        self._prev_ear = ear
        if self._blink_cooldown > 0:
            self._blink_cooldown -= 1

        if ear < self.ear_closed_thresh:
            self._closed_frames += 1
        else:
            self._closed_frames = max(0, self._closed_frames - 1)

        prolonged = self._closed_frames >= 12  # ~0.4s at 30fps
        microsleep_like = self._closed_frames >= 28

        if prolonged:
            event_labels.append("prolonged_eye_closure")
        if microsleep_like:
            event_labels.append("microsleep_like")

        mar_smooth = float(np.mean(self._mar_hist)) if self._mar_hist else mar
        yawn_score = float(np.clip((mar_smooth - 0.22) / max(1e-6, self.mar_yawn_thresh - 0.22), 0, 1))
        if mar_smooth > self.mar_yawn_thresh:
            event_labels.append("yawn")

        # Drowsiness aggregate (heuristic)
        drowsiness_score = float(
            np.clip(0.45 * eyes_closed_score + 0.35 * yawn_score + 0.2 * min(1.0, self._closed_frames / 30.0), 0, 1)
        )

        # Experimental impairment — clearly subordinate to disclaimers in product copy
        impairment_risk_score = float(
            np.clip(0.12 * drowsiness_score + 0.55 * eyes_closed_score + 0.08 * yawn_score, 0, 0.35)
        )

        return PipelineResult(
            face_detected=True,
            blink_detected=blink_detected,
            eyes_closed_score=eyes_closed_score,
            yawn_score=yawn_score,
            drowsiness_score=drowsiness_score,
            impairment_risk_score=impairment_risk_score,
            event_labels=list(dict.fromkeys(event_labels)),
            raw_ear=float(ear),
            raw_mar=float(mar_smooth),
        )

    def close(self) -> None:
        self.face_mesh.close()
