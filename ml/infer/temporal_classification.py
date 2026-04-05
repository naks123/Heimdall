"""
Temporal gating for live classification:
- microsleep vs blink (sustained eye closure vs short closure + blink event)
- yawning vs quick mouth open (sustained RF + baseline mouth cue vs brief spike)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from .baseline import PipelineResult


@dataclass
class TemporalGateConfig:
    # --- microsleep vs blink ---
    microsleep_min_consecutive_sec: float = 0.48
    microsleep_min_conf: float = 0.38
    blink_suppress_sec: float = 0.32
    baseline_short_sec: float = 0.22
    min_frames_any_path: int = 3

    # --- yawning vs quick mouth open ---
    yawning_min_consecutive_sec: float = 0.42
    yawning_min_conf: float = 0.38
    # When baseline already flags yawn + high yawn_score, allow shorter RF streak
    yawning_baseline_short_sec: float = 0.18
    yawning_baseline_score_min: float = 0.52
    # If Model 1 thinks mouth is fairly closed, do not trust RF "yawning"
    yawning_mouth_closed_veto: float = 0.30


class TemporalClassificationGate:
    """Call :meth:`step` once per frame after you have raw classifier output + PipelineResult."""

    def __init__(self, effective_fps: float, cfg: Optional[TemporalGateConfig] = None) -> None:
        self._fps = max(1.0, min(120.0, float(effective_fps)))
        self._cfg = cfg or TemporalGateConfig()
        self._ms_streak = 0
        self._yawn_streak = 0
        self._blink_suppress_remaining = 0

    def reset(self) -> None:
        """Call when face is lost so streaks do not carry across tracks."""
        self._ms_streak = 0
        self._yawn_streak = 0
        self._blink_suppress_remaining = 0

    def _sec_to_frames(self, sec: float) -> int:
        return max(1, int(round(sec * self._fps)))

    def step(
        self,
        raw_label: str,
        raw_conf: float,
        probs: Dict[str, float],
        pr: Optional[PipelineResult],
    ) -> Tuple[str, float]:
        """
        raw_label / raw_conf: top-1 from the classifier.
        probs: class name -> probability (same row as raw).
        pr: baseline result for this frame (None in mock mode).
        """
        blink = bool(pr and pr.blink_detected)
        labels = set(pr.event_labels) if pr else set()
        ms_like = "microsleep_like" in labels
        prolonged = "prolonged_eye_closure" in labels
        yawn_event = "yawn" in labels
        ys = float(pr.yawn_score) if pr else 1.0

        if blink:
            self._blink_suppress_remaining = self._sec_to_frames(self._cfg.blink_suppress_sec)
            self._ms_streak = 0
            self._yawn_streak = 0

        suppress_active = self._blink_suppress_remaining > 0
        if self._blink_suppress_remaining > 0:
            self._blink_suppress_remaining -= 1

        # ----- microsleep streak -----
        if raw_label == "microsleep" and raw_conf >= self._cfg.microsleep_min_conf:
            self._ms_streak += 1
        else:
            self._ms_streak = 0

        long_f = self._sec_to_frames(self._cfg.microsleep_min_consecutive_sec)
        short_f = self._sec_to_frames(self._cfg.baseline_short_sec)
        need_ms = long_f
        if ms_like or prolonged:
            need_ms = max(self._cfg.min_frames_any_path, min(long_f, short_f))

        allow_microsleep = (
            raw_label == "microsleep"
            and raw_conf >= self._cfg.microsleep_min_conf
            and self._ms_streak >= need_ms
            and not suppress_active
        )

        if allow_microsleep:
            return "microsleep", raw_conf

        if raw_label == "microsleep":
            p_active = float(probs.get("active", 0.55))
            return "active", max(p_active, 1.0 - raw_conf)

        # ----- yawning vs quick mouth open -----
        if suppress_active and raw_label == "yawning":
            self._yawn_streak = 0
            p_active = float(probs.get("active", 0.55))
            return "active", max(p_active, 1.0 - raw_conf)

        if raw_label == "yawning":
            if pr and ys < self._cfg.yawning_mouth_closed_veto:
                self._yawn_streak = 0
                p_active = float(probs.get("active", 0.55))
                return "active", max(p_active, 1.0 - raw_conf)
            if raw_conf >= self._cfg.yawning_min_conf:
                self._yawn_streak += 1
            else:
                self._yawn_streak = 0
        else:
            self._yawn_streak = 0

        ylong = self._sec_to_frames(self._cfg.yawning_min_consecutive_sec)
        yshort = self._sec_to_frames(self._cfg.yawning_baseline_short_sec)
        need_yawn = ylong
        if yawn_event and ys >= self._cfg.yawning_baseline_score_min:
            need_yawn = max(self._cfg.min_frames_any_path, min(ylong, yshort))

        allow_yawn = (
            raw_label == "yawning"
            and raw_conf >= self._cfg.yawning_min_conf
            and self._yawn_streak >= need_yawn
            and not (pr and ys < self._cfg.yawning_mouth_closed_veto)
        )

        if allow_yawn:
            return "yawning", raw_conf

        if raw_label == "yawning":
            p_active = float(probs.get("active", 0.55))
            return "active", max(p_active, 1.0 - raw_conf)

        return raw_label, raw_conf
