"""Tests for cumulative risk from yawning / microsleep episodes."""
from __future__ import annotations

import pytest

from infer.cumulative_risk import CumulativeRiskConfig, CumulativeRiskTracker


def test_low_yawn_never_triggers() -> None:
    cfg = CumulativeRiskConfig(
        yawn_window_sec=1.0,
        yawn_trigger_avg=0.50,
        yawn_release_avg=0.42,
        yawn_weight=1.0,
        sleep_window_sec=2.0,
        sleep_weight=1.0,
    )
    tr = CumulativeRiskTracker(config=cfg)
    t = 0.0
    dt = 0.1
    for _ in range(80):
        tr.step(t, 0.35, 0.0, True)
        t += dt
    assert tr.total_risk == 0.0


def test_yawn_episode_adds_weighted_integral() -> None:
    cfg = CumulativeRiskConfig(
        yawn_window_sec=1.0,
        yawn_trigger_avg=0.50,
        yawn_release_avg=0.42,
        yawn_weight=1.0,
        sleep_window_sec=99.0,
        sleep_trigger_avg=0.99,
        sleep_weight=1.0,
    )
    tr = CumulativeRiskTracker(config=cfg)
    t = 0.0
    dt = 0.1
    for _ in range(12):
        tr.step(t, 0.80, 0.0, True)
        t += dt
    for _ in range(40):
        tr.step(t, 0.80, 0.0, True)
        t += dt
    for _ in range(30):
        tr.step(t, 0.05, 0.0, True)
        t += dt
    assert tr.total_risk > 0.0
    assert 0.5 < tr.total_risk < 5.0


def test_face_loss_flushes_open_episode() -> None:
    cfg = CumulativeRiskConfig(
        yawn_window_sec=1.0,
        yawn_weight=1.0,
        sleep_window_sec=99.0,
        sleep_trigger_avg=0.99,
        sleep_weight=0.0,
    )
    tr = CumulativeRiskTracker(config=cfg)
    t = 0.0
    dt = 0.1
    for _ in range(50):
        tr.step(t, 0.85, 0.0, True)
        t += dt
    before = tr.total_risk
    tr.step(t, 0.85, 0.0, False)
    assert tr.total_risk > before


def test_normalized_risk_01_clamped() -> None:
    cfg = CumulativeRiskConfig(
        risk_full_scale_per_sec=0.1,
        risk_normalization_min_elapsed_sec=1.0,
        yawn_weight=0.0,
        sleep_weight=0.0,
    )
    tr = CumulativeRiskTracker(config=cfg)
    tr.total_risk = 0.5
    assert tr.normalized_risk_01(10.0) == pytest.approx(0.5, abs=0.02)
    tr.total_risk = 0.0
    assert tr.normalized_risk_01(5.0) == 0.0
    tr.total_risk = 1.0
    assert tr.normalized_risk_01(1.0) == 1.0


def test_sleep_episode_adds_risk() -> None:
    cfg = CumulativeRiskConfig(
        yawn_window_sec=99.0,
        yawn_trigger_avg=0.99,
        yawn_weight=0.0,
        sleep_window_sec=0.5,
        sleep_trigger_avg=0.50,
        sleep_release_avg=0.30,
        sleep_weight=10.0,
    )
    tr = CumulativeRiskTracker(config=cfg)
    t = 0.0
    dt = 0.05
    for _ in range(30):
        tr.step(t, 0.0, 0.55, True)
        t += dt
    for _ in range(20):
        tr.step(t, 0.0, 0.1, True)
        t += dt
    assert tr.total_risk > 0.0
