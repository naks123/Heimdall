"""
Face landmarks (MediaPipe Tasks Face Landmarker) + EAR / MAR heuristics + temporal smoothing.
Compatible with mediapipe>=0.10.30 (legacy mp.solutions was removed from the wheel).
"""
from __future__ import annotations

import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions
from mediapipe.tasks.python.vision.core import image as mp_image_module
from mediapipe.tasks.python.vision.core import vision_task_running_mode

# Face Landmarker (478 landmarks) — same classic indices as Face Mesh for eyes/mouth region
LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
MOUTH_INDICES = [61, 291, 0, 17, 269, 409]

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)


def _ensure_face_landmarker_model(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 1_000_000:
        return
    urllib.request.urlretrieve(MODEL_URL, path)


def _euclidean(p1: np.ndarray, p2: np.ndarray) -> float:
    return float(np.linalg.norm(p1 - p2))


def eye_aspect_ratio(pts: np.ndarray) -> float:
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
    blendshape_scores: Dict[str, float]

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


def blend_shapes_to_dict(face_blendshapes: Any) -> Dict[str, float]:
    if not face_blendshapes or not face_blendshapes[0]:
        return {}
    return {str(c.category_name): float(c.score) for c in face_blendshapes[0]}


def apply_blendshape_adjustments(ear: float, mar: float, scores: Dict[str, float]) -> tuple[float, float]:
    if not scores:
        return ear, mar
    blink_combo = max(scores.get("eyeBlinkLeft", 0), scores.get("eyeBlinkRight", 0))
    ear = float(ear * (1.0 - 0.35 * blink_combo))
    jaw_open = scores.get("jawOpen", 0)
    mar = float(max(mar, jaw_open * 0.45))
    return ear, mar


def compute_ear_mar_for_frame(
    lms: List[Any],
    w: int,
    h: int,
    face_blendshapes: Any,
) -> tuple[float, float, Dict[str, float]]:
    """Geometry + same blendshape tweaks as the live pipeline (single frame)."""
    n = len(lms)
    max_idx = max(max(LEFT_EYE_INDICES), max(RIGHT_EYE_INDICES), max(MOUTH_INDICES))
    if n <= max_idx:
        return 0.0, 0.0, {}
    left = _landmarks_to_np(lms, w, h, LEFT_EYE_INDICES)
    right = _landmarks_to_np(lms, w, h, RIGHT_EYE_INDICES)
    mouth = _landmarks_to_np(lms, w, h, MOUTH_INDICES)
    ear_l = eye_aspect_ratio(left)
    ear_r = eye_aspect_ratio(right)
    ear = (ear_l + ear_r) / 2.0
    mar = mouth_aspect_ratio(mouth[:4])
    scores = blend_shapes_to_dict(face_blendshapes)
    ear, mar = apply_blendshape_adjustments(ear, mar, scores)
    return ear, mar, scores


def _scale_frames_at_fps(base_at_30fps: int, effective_fps: float) -> int:
    return max(1, int(round(base_at_30fps * effective_fps / 30.0)))


def _landmarks_to_np(lms: List[Any], w: int, h: int, indices: List[int]) -> np.ndarray:
    return np.array([[lms[i].x * w, lms[i].y * h] for i in indices], dtype=np.float64)


_EYE_MOUTH_HIGHLIGHT = frozenset(LEFT_EYE_INDICES + RIGHT_EYE_INDICES + MOUTH_INDICES)


class BaselineDrowsinessPipeline:
    def __init__(
        self,
        ear_closed_thresh: float = 0.18,
        ear_open_thresh: float = 0.22,
        mar_yawn_thresh: float = 0.38,
        seq_len: int = 8,
        model_path: Optional[Path] = None,
        effective_fps: float = 30.0,
    ):
        self._model_path = model_path or (Path(__file__).resolve().parent.parent / "models" / "face_landmarker.task")
        _ensure_face_landmarker_model(self._model_path)

        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(self._model_path)),
            running_mode=vision_task_running_mode.VisionTaskRunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=True,
        )
        self._landmarker = FaceLandmarker.create_from_options(options)
        self._video_ts_ms = 0

        self.ear_closed_thresh = ear_closed_thresh
        self.ear_open_thresh = ear_open_thresh
        self.mar_yawn_thresh = mar_yawn_thresh
        self._ear_hist: List[float] = []
        self._mar_hist: List[float] = []
        self._closed_frames = 0
        self._blink_cooldown = 0
        self._prev_ear: Optional[float] = None
        # Pixel coords for last frame (for debug overlay); None if no face
        self._last_landmark_pixels: Optional[np.ndarray] = None
        self._seq_len_nominal = seq_len
        self.set_effective_fps(effective_fps)

    def set_effective_fps(self, fps: float) -> None:
        """Update frame-duration assumptions (metadata FPS, measured FPS, or --fps override)."""
        self.effective_fps = float(max(1.0, min(120.0, fps)))
        self._frame_dt_ms = 1000.0 / self.effective_fps
        self._reinit_temporal_scales(self._seq_len_nominal)

    def _reinit_temporal_scales(self, seq_len_nominal: int) -> None:
        ef = self.effective_fps
        self._seq_len = max(4, _scale_frames_at_fps(seq_len_nominal, ef))
        self._blink_cooldown_max = max(3, _scale_frames_at_fps(8, ef))
        self._prolonged_frames = max(6, _scale_frames_at_fps(12, ef))
        self._microsleep_frames = max(14, _scale_frames_at_fps(28, ef))

    def draw_landmarks_on(self, frame_bgr: np.ndarray, *, point_fraction: float = 1.0) -> None:
        """Draw tracked landmark points on frame (mutates in place).

        point_fraction: 1.0 = all points; 0.5 ≈ every other point (~half the mesh).
        """
        pts = self._last_landmark_pixels
        if pts is None:
            return
        pf = float(max(1e-6, min(1.0, point_fraction)))
        step = max(1, int(round(1.0 / pf)))
        for i in range(0, len(pts), step):
            x, y = int(pts[i][0]), int(pts[i][1])
            if x < 0 or y < 0:
                continue
            # BGR: orange for EAR/MAR indices, cyan for rest
            color = (0, 165, 255) if i in _EYE_MOUTH_HIGHLIGHT else (255, 255, 0)
            cv2.circle(frame_bgr, (x, y), 2, color, -1, lineType=cv2.LINE_AA)

    def process_bgr(self, frame_bgr: np.ndarray) -> PipelineResult:
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_frame = mp_image_module.Image(image_format=mp_image_module.ImageFormat.SRGB, data=rgb)
        self._video_ts_ms += int(round(self._frame_dt_ms))
        result = self._landmarker.detect_for_video(mp_frame, self._video_ts_ms)
        event_labels: List[str] = []

        if not result.face_landmarks:
            self._last_landmark_pixels = None
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
                blendshape_scores={},
            )

        lms = result.face_landmarks[0]
        n = len(lms)
        max_idx = max(max(LEFT_EYE_INDICES), max(RIGHT_EYE_INDICES), max(MOUTH_INDICES))
        if n <= max_idx:
            self._last_landmark_pixels = None
            return PipelineResult(
                face_detected=True,
                blink_detected=False,
                eyes_closed_score=0.0,
                yawn_score=0.0,
                drowsiness_score=0.0,
                impairment_risk_score=0.0,
                event_labels=["landmark_index_mismatch"],
                raw_ear=0.0,
                raw_mar=0.0,
                blendshape_scores={},
            )

        ear, mar, blend_scores = compute_ear_mar_for_frame(lms, w, h, result.face_blendshapes)

        self._last_landmark_pixels = np.array(
            [[int(lm.x * w), int(lm.y * h)] for lm in lms], dtype=np.int32
        )

        self._ear_hist.append(ear)
        self._ear_hist = self._ear_hist[-self._seq_len :]
        self._mar_hist.append(mar)
        self._mar_hist = self._mar_hist[-self._seq_len :]

        eyes_open = np.clip(
            (ear - self.ear_closed_thresh) / max(1e-6, self.ear_open_thresh - self.ear_closed_thresh), 0, 1
        )
        eyes_closed_score = float(1.0 - eyes_open)

        blink_detected = False
        if self._prev_ear is not None and self._prev_ear > self.ear_open_thresh and ear < self.ear_closed_thresh:
            if self._blink_cooldown <= 0:
                blink_detected = True
                self._blink_cooldown = self._blink_cooldown_max
                event_labels.append("blink")
        self._prev_ear = ear
        if self._blink_cooldown > 0:
            self._blink_cooldown -= 1

        if ear < self.ear_closed_thresh:
            self._closed_frames += 1
        else:
            self._closed_frames = max(0, self._closed_frames - 1)

        prolonged = self._closed_frames >= self._prolonged_frames
        microsleep_like = self._closed_frames >= self._microsleep_frames

        if prolonged:
            event_labels.append("prolonged_eye_closure")
        if microsleep_like:
            event_labels.append("microsleep_like")

        mar_smooth = float(np.mean(self._mar_hist)) if self._mar_hist else mar
        yawn_score = float(np.clip((mar_smooth - 0.22) / max(1e-6, self.mar_yawn_thresh - 0.22), 0, 1))
        if mar_smooth > self.mar_yawn_thresh:
            event_labels.append("yawn")

        drowsiness_score = float(
            np.clip(
                0.45 * eyes_closed_score
                + 0.35 * yawn_score
                + 0.2 * min(1.0, self._closed_frames / max(1e-6, self.effective_fps)),
                0,
                1,
            )
        )

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
            blendshape_scores=dict(blend_scores),
        )

    def close(self) -> None:
        self._landmarker.close()
