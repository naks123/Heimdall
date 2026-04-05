"""
Local inference HTTP API for demos (Node backend can proxy).

  cd ml && uvicorn serve_inference:app --host 0.0.0.0 --port 5055

Env:
  HEIMDALL_MOCK_INFERENCE=1  — return synthetic JSON without MediaPipe
"""
from __future__ import annotations

import base64
import os
import time
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from infer.baseline import BaselineDrowsinessPipeline
from risk_engine import FrameSignals, RiskState, load_config_from_yaml, update_risk

MOCK = os.environ.get("HEIMDALL_MOCK_INFERENCE", "").lower() in ("1", "true", "yes")

app = FastAPI(title="Heimdall Inference", version="0.1.0")
_cfg = load_config_from_yaml()
_risk_state = RiskState()
_pipe: Optional[BaselineDrowsinessPipeline] = None
_t0 = time.time()


def get_pipe() -> BaselineDrowsinessPipeline:
    global _pipe
    if _pipe is None:
        _pipe = BaselineDrowsinessPipeline()
    return _pipe


class InferRequest(BaseModel):
    image_b64: Optional[str] = None
    timestamp_sec: Optional[float] = None


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "mock": str(MOCK)}


@app.post("/infer")
def infer(body: InferRequest) -> Dict[str, Any]:
    global _risk_state
    now = body.timestamp_sec if body.timestamp_sec is not None else time.time() - _t0

    if MOCK or body.image_b64 is None:
        phase = (now * 0.5) % 5.0
        result_dict = {
            "face_detected": True,
            "blink_detected": False,
            "eyes_closed_score": 0.3 if phase < 1 else 0.05,
            "yawn_score": 0.75 if 2 < phase < 2.8 else 0.1,
            "drowsiness_score": 0.4,
            "impairment_risk_score": 0.08,
            "event_labels": ["yawn"] if 2 < phase < 2.8 else [],
        }
    else:
        raw = base64.b64decode(body.image_b64.split(",")[-1])
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(400, "invalid image")
        pr = get_pipe().process_bgr(frame)
        result_dict = pr.to_api_dict()

    sig = FrameSignals(
        timestamp_sec=now,
        face_detected=result_dict["face_detected"],
        eyes_closed_score=result_dict["eyes_closed_score"],
        yawn_score=result_dict["yawn_score"],
        drowsiness_score=result_dict["drowsiness_score"],
        blink_detected=result_dict["blink_detected"],
        prolonged_eye_closure="prolonged_eye_closure" in result_dict.get("event_labels", []),
        microsleep_like="microsleep_like" in result_dict.get("event_labels", []),
        yawn_event="yawn" in result_dict.get("event_labels", []),
        event_labels=list(result_dict.get("event_labels", [])),
    )
    _risk_state, dbg = update_risk(_risk_state, sig, _cfg)
    out = dict(result_dict)
    out["aggregated_risk"] = _risk_state.risk
    out["debug"] = dbg
    return out


@app.post("/reset_risk")
def reset_risk() -> Dict[str, str]:
    global _risk_state
    _risk_state = RiskState()
    return {"status": "reset"}
