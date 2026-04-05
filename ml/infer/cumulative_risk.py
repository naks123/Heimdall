"""
Cumulative risk from sustained yawning and microsleep episodes.

- Active/alert does not contribute (only yawning and microsleep probabilities are used).
- Yawning: rolling mean of P(yawning) over 1 s; episode while mean >= trigger; ends when mean < release.
  Contribution per closed episode: episode_mean_p * duration_sec * yawn_weight (small).
- Microsleep: rolling mean of P(microsleep) over 2 s; episode while mean >= trigger; ends when mean < release.
  Contribution per closed episode: episode_mean_p * duration_sec * sleep_weight (larger).

Episodes flush on face loss (partial duration counted).
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Tuple


@dataclass
class CumulativeRiskConfig:
    yawn_window_sec: float = 1.0
    yawn_trigger_avg: float = 0.50
    yawn_release_avg: float = 0.42
    yawn_weight: float = 0.06

    sleep_window_sec: float = 2.0
    sleep_trigger_avg: float = 0.50
    sleep_release_avg: float = 0.42
    sleep_weight: float = 0.38


@dataclass
class _EpisodeAxis:
    window_sec: float
    trigger_avg: float
    release_avg: float
    weight: float
    trigger_strict_gt: bool
    """If True, enter when roll > trigger; else enter when roll >= trigger."""

    _samples: Deque[Tuple[float, float]] = field(default_factory=deque)
    _in_episode: bool = False
    _ep_t0: float = 0.0
    _ep_sum_p: float = 0.0
    _ep_n: int = 0

    def _roll_avg(self) -> float:
        if not self._samples:
            return 0.0
        return sum(p for _, p in self._samples) / len(self._samples)

    def _window_span_sec(self, now_sec: float) -> float:
        if not self._samples:
            return 0.0
        return now_sec - self._samples[0][0]

    def _window_mature(self, now_sec: float) -> bool:
        """Require ~full window of history before an episode can start (avoids 1-frame spikes)."""
        return self._window_span_sec(now_sec) >= self.window_sec * 0.95

    def _triggered(self, roll: float) -> bool:
        if self.trigger_strict_gt:
            return roll > self.trigger_avg
        return roll >= self.trigger_avg

    def reset_buffers(self) -> None:
        self._samples.clear()

    def on_face_lost(self, now_sec: float) -> float:
        """Close any open episode (count partial duration) and drop rolling history."""
        delta = self.flush_episode(now_sec)
        self.reset_buffers()
        return delta

    def flush_episode(self, now_sec: float) -> float:
        """If in an episode, close it and return risk delta; else 0."""
        if not self._in_episode:
            return 0.0
        duration = max(0.0, now_sec - self._ep_t0)
        avg_p = self._ep_sum_p / max(1, self._ep_n)
        delta = avg_p * duration * self.weight
        self._in_episode = False
        self._ep_sum_p = 0.0
        self._ep_n = 0
        return delta

    def step(self, now_sec: float, p_raw: float) -> float:
        """
        Update rolling window, manage episode, return risk added this step (episode closures only).
        """
        self._samples.append((now_sec, float(p_raw)))
        cutoff = now_sec - self.window_sec
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()

        roll = self._roll_avg()
        added = 0.0

        if self._in_episode:
            if roll < self.release_avg:
                duration = max(0.0, now_sec - self._ep_t0)
                avg_p = self._ep_sum_p / max(1, self._ep_n)
                added += avg_p * duration * self.weight
                self._in_episode = False
                self._ep_sum_p = 0.0
                self._ep_n = 0
            else:
                self._ep_sum_p += float(p_raw)
                self._ep_n += 1

        if not self._in_episode and self._window_mature(now_sec) and self._triggered(roll):
            self._in_episode = True
            self._ep_t0 = now_sec
            self._ep_sum_p = float(p_raw)
            self._ep_n = 1

        return added


@dataclass
class CumulativeRiskTracker:
    config: CumulativeRiskConfig = field(default_factory=CumulativeRiskConfig)
    total_risk: float = 0.0

    _yawn: _EpisodeAxis = field(init=False)
    _sleep: _EpisodeAxis = field(init=False)

    def __post_init__(self) -> None:
        c = self.config
        self._yawn = _EpisodeAxis(
            window_sec=c.yawn_window_sec,
            trigger_avg=c.yawn_trigger_avg,
            release_avg=c.yawn_release_avg,
            weight=c.yawn_weight,
            trigger_strict_gt=False,
        )
        self._sleep = _EpisodeAxis(
            window_sec=c.sleep_window_sec,
            trigger_avg=c.sleep_trigger_avg,
            release_avg=c.sleep_release_avg,
            weight=c.sleep_weight,
            trigger_strict_gt=False,
        )

    def step(self, now_sec: float, p_yawning: float, p_microsleep: float, face_ok: bool) -> None:
        if not face_ok:
            self.total_risk += self._yawn.on_face_lost(now_sec)
            self.total_risk += self._sleep.on_face_lost(now_sec)
            return

        self.total_risk += self._yawn.step(now_sec, p_yawning)
        self.total_risk += self._sleep.step(now_sec, p_microsleep)
