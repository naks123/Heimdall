# ML package

- **`risk_engine/`** — exponential escalation + decay; `pytest` from repo root: `python -m pytest ml/risk_engine/tests`
- **`infer/baseline.py`** — MediaPipe **Tasks** Face Landmarker (`face_landmarker.task`, auto-downloaded to `ml/models/` on first run ~4MB)
- **`serve_inference.py`** — FastAPI server; set `HEIMDALL_MOCK_INFERENCE=1` to avoid MediaPipe
- **`training/`** — FL3D stubs; state classifier training via `train_state_classifier.py`
- **`scripts/infer_webcam.py`** — live webcam or video file with overlays (state, risk, landmarks)

---

## Live webcam demo (run the model + overlay)

Do this on any machine after cloning the repo. You need a **webcam**, **Python 3.10+**, and **network** the first time (to download the MediaPipe model).

### 1. Clone and enter the repo

```bash
git clone <your-repo-url> Heimdall
cd Heimdall
```

All Python commands below assume the **repository root** (`Heimdall/`) as the current working directory.

### 2. Create a virtual environment (recommended)

**Windows (PowerShell):**

```powershell
cd ml
python -m venv .venv
.\.venv\Scripts\activate
```

**macOS / Linux:**

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

From the **`ml/`** directory (with the venv activated):

```bash
pip install -U pip
pip install -r requirements.txt
```

Or from **repo root**:

```bash
pip install -r ml/requirements.txt
```

`opencv-python` includes GUI support needed for `cv2.imshow` on the webcam window.

### 4. Get a state classifier (`state_clf.joblib`)

The overlay needs a sklearn bundle produced by `train_state_classifier.py` (model + label encoder + feature columns). You can either:

**A. Use an existing bundle** — copy `state_clf.joblib` into `ml/checkpoints/` (same folder as the `*.meta.json` examples in the repo).

**B. Train one from labeled features** — if you have `ml/data/features.csv` (or another CSV with a `label` column and feature columns matching the pipeline):

```bash
# from repo root
python -m ml.training.train_state_classifier --csv ml/data/features.csv --out ml/checkpoints/state_clf.joblib
```

If `ml/checkpoints/state_clf.joblib` exists, you **do not** need to pass `--classifier` on the command line (the script auto-loads it).

### 5. First run downloads the face model

The first time you run inference, MediaPipe downloads **`face_landmarker.task`** into `ml/models/` (ignored by git if large). Ensure outbound HTTPS is allowed.

### 6. Run the webcam overlay

From **repository root**:

```bash
python -m ml.scripts.infer_webcam --classifier ml/checkpoints/state_clf.joblib
```

If the default checkpoint path exists:

```bash
python -m ml.scripts.infer_webcam
```

**Windows path example** (same command, backslashes):

```powershell
python -m ml.scripts.infer_webcam --classifier ml\checkpoints\state_clf.joblib
```

**Use another camera** (default is `0`):

```bash
python -m ml.scripts.infer_webcam --classifier ml/checkpoints/state_clf.joblib
```

**Quit:** focus the video window and press **Q** or **Esc**. On Windows, closing the window with the mouse may not stop the loop; use Q/Esc.

### 7. What you should see

- **Classification** line (e.g. active / yawning / microsleep) with confidence  
- **Risk** line (0–1 vs session time) when a classifier is loaded  
- **Face mesh** (landmark dots) by default; `--landmark-fraction 0` turns them off  
- Optional **sleep beep** (live only); `--no-sleep-beep` disables it  

### 8. Optional: process a video file instead of the webcam

Write an overlaid MP4/MOV (requires `--output`):

```bash
python -m ml.scripts.infer_webcam --classifier ml/checkpoints/state_clf.joblib --video path/to/input.mp4 -o path/to/output_overlay.mp4
```

Timeline for rolling windows uses **media time** (frame index / FPS), not wall clock. Audio beeps are disabled in file mode.

---

## Environment variables (optional)

| Variable | Purpose |
|----------|---------|
| `HEIMDALL_CLASSIFIER` | Full path to a `.joblib` bundle if you do not use `ml/checkpoints/state_clf.joblib` |
| `HEIMDALL_MOCK_INFERENCE=1` | For `serve_inference.py` only — return synthetic JSON without MediaPipe |

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `No module named 'ml'` | Run commands from **repo root**, not inside `ml/scripts/`. |
| Cannot open camera | Close other apps using the webcam; try `--camera 1`. |
| No window / OpenCV GUI | On Linux you may need `opencv-python` (not headless) and a desktop session. |
| No classifier / no state or risk | Train or copy `state_clf.joblib` into `ml/checkpoints/` or pass `--classifier`. |
| Model download fails | Check firewall/proxy; manually place `face_landmarker.task` under `ml/models/` per `infer/baseline.py`. |

---

## Tests

```bash
pip install -r ml/requirements.txt
python -m pytest ml/risk_engine/tests ml/infer/tests
```
