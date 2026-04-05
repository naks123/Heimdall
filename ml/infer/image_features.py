"""
Single-image feature extraction (MediaPipe IMAGE mode) for offline datasets.

VIDEO-mode tracking state is not shared across files; use this for CSV export / training.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions
from mediapipe.tasks.python.vision.core import image as mp_image_module
from mediapipe.tasks.python.vision.core import vision_task_running_mode

from .baseline import _ensure_face_landmarker_model, compute_ear_mar_for_frame


@dataclass
class StaticFeatureRow:
    face_detected: bool
    raw_ear: float
    raw_mar: float
    blendshape_scores: Dict[str, float]
    path: str = ""


class StaticImageLandmarker:
    """Face Landmarker in IMAGE running mode (one shot per frame)."""

    def __init__(self, model_path: Optional[Path] = None) -> None:
        self._model_path = model_path or (Path(__file__).resolve().parent.parent / "models" / "face_landmarker.task")
        _ensure_face_landmarker_model(self._model_path)
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(self._model_path)),
            running_mode=vision_task_running_mode.VisionTaskRunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=True,
        )
        self._landmarker = FaceLandmarker.create_from_options(options)

    def close(self) -> None:
        self._landmarker.close()

    def process_bgr(self, frame_bgr: np.ndarray, path: str = "") -> StaticFeatureRow:
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_frame = mp_image_module.Image(image_format=mp_image_module.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect(mp_frame)

        if not result.face_landmarks:
            return StaticFeatureRow(False, 0.0, 0.0, {}, path)

        lms = result.face_landmarks[0]
        ear, mar, scores = compute_ear_mar_for_frame(lms, w, h, result.face_blendshapes)
        return StaticFeatureRow(True, float(ear), float(mar), dict(scores), path)


def row_to_flat_dict(row: StaticFeatureRow, blendshape_key_order: List[str]) -> Dict[str, Any]:
    """Fixed column order for CSV / sklearn (missing blendshapes → 0)."""
    out: Dict[str, Any] = {
        "path": row.path,
        "face_ok": int(row.face_detected),
        "raw_ear": row.raw_ear,
        "raw_mar": row.raw_mar,
    }
    for k in blendshape_key_order:
        out[f"bs_{k}"] = float(row.blendshape_scores.get(k, 0.0))
    return out
