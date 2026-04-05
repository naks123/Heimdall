from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class FrameSignals:
    """Per-frame inputs from CV / heuristics (0–1 scores unless noted)."""

    timestamp_sec: float
    face_detected: bool
    eyes_closed_score: float
    yawn_score: float
    drowsiness_score: float
    blink_detected: bool
    prolonged_eye_closure: bool
    microsleep_like: bool
    yawn_event: bool
    event_labels: List[str]
