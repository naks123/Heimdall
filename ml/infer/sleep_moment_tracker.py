"""
Rolling-window average of P(microsleep); count discrete "sleeping moments" when avg > threshold.

Uses per-frame samples while a face is present; window prunes by wall-clock time (default 2 s).
Episodes are counted on a rising edge with hysteresis so one long high spell increments once.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Tuple


@dataclass
class RollingMicrosleepMomentTracker:
    window_sec: float = 2.0
    """Trigger one sleeping moment when rolling average of P(microsleep) reaches at least this."""
    trigger_avg_above: float = 0.50
    """After a trigger, require average to fall below this before another moment can be counted."""
    rearm_avg_below: float = 0.50

    _samples: Deque[Tuple[float, float]] = field(default_factory=deque)
    _armed: bool = True
    count: int = 0

    def reset(self) -> None:
        self._samples.clear()
        self._armed = True

    def step(self, now_sec: float, p_microsleep: float) -> float:
        """
        Append one sample (typically each processed frame with a face).
        Returns current rolling average P(microsleep) over the last window_sec (0 if empty).
        """
        self._samples.append((now_sec, float(p_microsleep)))
        cutoff = now_sec - self.window_sec
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()

        if not self._samples:
            return 0.0

        avg = sum(p for _, p in self._samples) / len(self._samples)

        if avg >= self.trigger_avg_above and self._armed:
            self.count += 1
            self._armed = False
        elif avg < self.rearm_avg_below:
            self._armed = True

        return avg
