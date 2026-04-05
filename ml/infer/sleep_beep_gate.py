"""
Alert when rolling mean P(microsleep) is high over a fixed window.

Uses wall-clock deques (same pattern as RollingMicrosleepMomentTracker). After the 3 s window
is mature, a burst of beeps starts when the average exceeds ``trigger_above`` (60%). Beeping
repeats at ``beep_interval_sec`` until the rolling average drops **below** ``stop_below`` (55%).
"""
from __future__ import annotations

import sys
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Tuple


@dataclass
class RollingMicrosleepBeepGate:
    window_sec: float = 3.0
    """Start alerting when rolling average is strictly greater than this (e.g. 0.60 = 60%)."""
    trigger_above: float = 0.60
    """Stop alerting when rolling average is strictly below this (e.g. 0.55 = 55%)."""
    stop_below: float = 0.55
    """Minimum seconds between beeps while alerting."""
    beep_interval_sec: float = 0.45
    """Only evaluate once the deque spans at least this fraction of window_sec."""
    mature_fraction: float = 0.95

    _samples: Deque[Tuple[float, float]] = field(default_factory=deque)
    _alerting: bool = False
    _last_beep_sec: float = field(default=-1e9)

    def reset(self) -> None:
        self._samples.clear()
        self._alerting = False
        self._last_beep_sec = -1e9

    def step(self, now_sec: float, p_microsleep: float) -> bool:
        """
        Update with one frame. Returns True when a beep should play (repeats while alerting).
        """
        self._samples.append((now_sec, float(p_microsleep)))
        cutoff = now_sec - self.window_sec
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()

        if not self._samples:
            return False

        avg = sum(p for _, p in self._samples) / len(self._samples)
        span = now_sec - self._samples[0][0]
        mature = span >= self.window_sec * self.mature_fraction

        if not mature:
            return False

        if avg > self.trigger_above:
            self._alerting = True
        if avg < self.stop_below:
            self._alerting = False

        if self._alerting and (now_sec - self._last_beep_sec) >= self.beep_interval_sec:
            self._last_beep_sec = now_sec
            return True

        return False


def play_sleep_warning_beep() -> None:
    """Short system beep (Windows: winsound; elsewhere: terminal bell)."""
    if sys.platform == "win32":
        import winsound

        winsound.Beep(880, 180)
    else:
        sys.stdout.write("\a")
        sys.stdout.flush()
