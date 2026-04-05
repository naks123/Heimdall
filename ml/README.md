# ML package

- **`risk_engine/`** — exponential escalation + decay; `pytest` from this directory: `python -m pytest`
- **`infer/baseline.py`** — MediaPipe **Tasks** Face Landmarker (`face_landmarker.task`, auto-downloaded to `models/` on first run) + EAR/MAR heuristics. Newer `mediapipe` wheels no longer ship `mp.solutions`.
- **`serve_inference.py`** — FastAPI server; set `HEIMDALL_MOCK_INFERENCE=1` to avoid MediaPipe
- **`training/`** — FL3D stubs; fill manifest after download
- **`scripts/infer_webcam.py`** — OpenCV webcam loop

```bash
pip install -r requirements.txt
python -m pytest
```
