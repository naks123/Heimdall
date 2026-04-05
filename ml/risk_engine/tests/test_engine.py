import pytest

from risk_engine import RiskConfig, RiskState, update_risk, FrameSignals


def test_decay_when_no_face():
    cfg = RiskConfig()
    s = RiskState(risk=0.5, last_ts=0.0)
    sig = FrameSignals(
        timestamp_sec=1.0,
        face_detected=False,
        eyes_closed_score=0.0,
        yawn_score=0.0,
        drowsiness_score=0.0,
        blink_detected=False,
        prolonged_eye_closure=False,
        microsleep_like=False,
        yawn_event=False,
        event_labels=[],
    )
    ns, _ = update_risk(s, sig, cfg)
    assert ns.risk < 0.5


def test_yawn_escalation():
    cfg = RiskConfig()
    s = RiskState(risk=0.1, last_ts=0.0)
    t = 10.0
    for i in range(3):
        sig = FrameSignals(
            timestamp_sec=t + i * 2,
            face_detected=True,
            eyes_closed_score=0.1,
            yawn_score=0.8,
            drowsiness_score=0.3,
            blink_detected=False,
            prolonged_eye_closure=False,
            microsleep_like=False,
            yawn_event=True,
            event_labels=["yawn"],
        )
        s, dbg = update_risk(s, sig, cfg)
    assert s.risk > 0.25


def test_prolonged_closure_sharp_bump():
    cfg = RiskConfig()
    s = RiskState(risk=0.05, last_ts=100.0)
    sig = FrameSignals(
        timestamp_sec=101.0,
        face_detected=True,
        eyes_closed_score=0.9,
        yawn_score=0.0,
        drowsiness_score=0.7,
        blink_detected=False,
        prolonged_eye_closure=True,
        microsleep_like=True,
        yawn_event=False,
        event_labels=["prolonged_eye_closure"],
    )
    ns, dbg = update_risk(s, sig, cfg)
    assert ns.risk > 0.4
