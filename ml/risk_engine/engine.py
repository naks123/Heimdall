"""
Exponential escalation + decay risk engine. Pure functions for testability.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

from .types import FrameSignals


@dataclass
class RiskConfig:
    decay_per_second: float = 0.012
    min_risk: float = 0.0
    max_risk: float = 1.0

    bump_yawn_first: float = 0.06
    bump_yawn_repeat_multiplier: float = 1.85
    yawn_window_sec: float = 45.0

    bump_prolonged_eye_closure: float = 0.18
    bump_microsleep_like: float = 0.42
    eye_closure_repeat_multiplier: float = 2.2
    eye_closure_window_sec: float = 30.0

    bump_blink_burst: float = 0.02
    bump_drowsiness_signal: float = 0.08

    stacking_exponent: float = 1.35
    cooldown_after_alert_sec: float = 8.0

    alert_risk_threshold: float = 0.55
    high_risk_threshold: float = 0.75

    impairment_from_drowsiness_weight: float = 0.15
    impairment_from_eye_closure_weight: float = 0.12


@dataclass
class RiskState:
    risk: float = 0.0
    last_ts: float = 0.0
    yawn_times: List[float] = field(default_factory=list)
    eye_closure_times: List[float] = field(default_factory=list)
    last_alert_ts: float = -1e9
    frame_history_drowsy: List[float] = field(default_factory=list)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _prune_window(times: List[float], now: float, window: float) -> List[float]:
    return [t for t in times if now - t <= window]


def _stacking_factor(count_in_window: int, exponent: float) -> float:
    if count_in_window <= 0:
        return 0.0
    return float(count_in_window ** exponent)


def compute_impairment_risk(
    drowsiness_score: float,
    eyes_closed_score: float,
    cfg: RiskConfig,
) -> float:
    """
    Very rough experimental 'possible impairment risk' — not a diagnosis.
    """
    raw = (
        cfg.impairment_from_drowsiness_weight * drowsiness_score
        + cfg.impairment_from_eye_closure_weight * eyes_closed_score
    )
    return _clamp(raw, 0.0, 1.0)


def update_risk(
    state: RiskState,
    signals: FrameSignals,
    cfg: RiskConfig,
) -> Tuple[RiskState, Dict[str, Any]]:
    """
    Single step update. Returns new state and debug payload.
    """
    now = signals.timestamp_sec
    debug: Dict[str, Any] = {}

    if not signals.face_detected:
        new_risk = state.risk
        if state.last_ts > 0:
            dt = max(0.0, now - state.last_ts)
            new_risk *= math.exp(-cfg.decay_per_second * 2.0 * dt)
        else:
            new_risk *= 0.94
        ns = RiskState(
            risk=_clamp(new_risk, cfg.min_risk, cfg.max_risk),
            last_ts=now,
            yawn_times=list(state.yawn_times),
            eye_closure_times=list(state.eye_closure_times),
            last_alert_ts=state.last_alert_ts,
            frame_history_drowsy=list(state.frame_history_drowsy),
        )
        return ns, {"reason": "no_face", **debug}

    new_risk = state.risk
    if state.last_ts > 0:
        dt = max(0.0, now - state.last_ts)
        new_risk *= math.exp(-cfg.decay_per_second * dt)

    yawn_times = _prune_window(list(state.yawn_times), now, cfg.yawn_window_sec)
    ec_times = _prune_window(list(state.eye_closure_times), now, cfg.eye_closure_window_sec)

    bumps: List[float] = []

    if signals.yawn_event:
        yawn_times.append(now)
        n = len([t for t in yawn_times if now - t <= cfg.yawn_window_sec])
        stack = _stacking_factor(n, cfg.stacking_exponent)
        bump = cfg.bump_yawn_first * (cfg.bump_yawn_repeat_multiplier ** max(0, n - 1)) * (
            0.5 + 0.5 * min(1.0, stack / max(1.0, n ** 0.5))
        )
        bumps.append(min(0.35, bump))
        debug["yawn_count_window"] = n

    if signals.microsleep_like:
        ec_times.append(now)
        n = len([t for t in ec_times if now - t <= cfg.eye_closure_window_sec])
        bump = cfg.bump_microsleep_like * (cfg.eye_closure_repeat_multiplier ** max(0, n - 1))
        bumps.append(min(0.65, bump))
        debug["microsleep_stack"] = n
    elif signals.prolonged_eye_closure:
        ec_times.append(now)
        n = len([t for t in ec_times if now - t <= cfg.eye_closure_window_sec])
        bump = cfg.bump_prolonged_eye_closure * (cfg.eye_closure_repeat_multiplier ** max(0, n - 1))
        bumps.append(min(0.5, bump))
        debug["eye_closure_stack"] = n

    if signals.blink_detected and signals.drowsiness_score > 0.45:
        bumps.append(cfg.bump_blink_burst)

    if signals.drowsiness_score > 0.5:
        bumps.append(cfg.bump_drowsiness_signal * signals.drowsiness_score)

    for b in bumps:
        new_risk += b

    new_risk = _clamp(new_risk, cfg.min_risk, cfg.max_risk)

    hist = list(state.frame_history_drowsy)
    hist.append(signals.drowsiness_score)
    hist = hist[-120:]

    impairment = compute_impairment_risk(
        signals.drowsiness_score,
        signals.eyes_closed_score,
        cfg,
    )

    ns = RiskState(
        risk=new_risk,
        last_ts=now,
        yawn_times=yawn_times,
        eye_closure_times=ec_times,
        last_alert_ts=state.last_alert_ts,
        frame_history_drowsy=hist,
    )

    alert = new_risk >= cfg.alert_risk_threshold
    if alert and now - state.last_alert_ts >= cfg.cooldown_after_alert_sec:
        ns.last_alert_ts = now

    debug.update(
        {
            "risk": new_risk,
            "impairment_risk_score": impairment,
            "alert": alert,
            "bumps_sum": sum(bumps),
        }
    )
    return ns, debug


def load_config_from_yaml(path: Optional[Path] = None) -> RiskConfig:
    p = path or Path(__file__).resolve().parent.parent / "config" / "risk_defaults.yaml"
    if not p.exists():
        return RiskConfig()
    with open(p, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    return RiskConfig(**{k: raw[k] for k in raw if hasattr(RiskConfig, k)})
