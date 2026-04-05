"""Tests for 3s rolling microsleep beep gate."""
from __future__ import annotations

from infer.sleep_beep_gate import RollingMicrosleepBeepGate


def test_no_beep_before_window_mature() -> None:
    g = RollingMicrosleepBeepGate(window_sec=0.3, mature_fraction=0.95)
    t = 0.0
    dt = 0.05
    for _ in range(5):
        assert not g.step(t, 0.99)
        t += dt


def test_repeats_while_alerting_then_stops_below_stop_below() -> None:
    g = RollingMicrosleepBeepGate(
        window_sec=0.2,
        trigger_above=0.60,
        stop_below=0.55,
        beep_interval_sec=0.1,
        mature_fraction=0.0,
    )
    t = 0.0
    dt = 0.05
    beeps = 0
    for _ in range(12):
        if g.step(t, 0.70):
            beeps += 1
        t += dt
    assert beeps >= 3
    for _ in range(80):
        g.step(t, 0.50)
        t += dt
    for _ in range(10):
        assert not g.step(t, 0.50)
        t += dt


def test_no_beep_when_never_exceeds_trigger() -> None:
    g = RollingMicrosleepBeepGate(
        window_sec=0.2,
        trigger_above=0.60,
        stop_below=0.55,
        beep_interval_sec=0.1,
        mature_fraction=0.0,
    )
    t = 0.0
    for _ in range(40):
        assert not g.step(t, 0.58)
        t += 0.05
