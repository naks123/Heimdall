# FL3D dataset (Kaggle)

Source: [Frame-level driver drowsiness detection (FL3D)](https://www.kaggle.com/datasets/matjazmuc/frame-level-driver-drowsiness-detection-fl3d)

## Download (requires Kaggle account)

1. Install Kaggle API: `pip install kaggle`
2. Place `kaggle.json` in `~/.kaggle/` (or `%USERPROFILE%\.kaggle\` on Windows)
3. `kaggle datasets download -d matjazmuc/frame-level-driver-drowsiness-detection-fl3d -p ml/data/`
4. Unzip into `ml/data/fl3d_raw/`

If you skip download, the training scripts remain stubs and the **MediaPipe baseline** still runs for demos.

## Label mapping

Adjust `ml/training/preprocess_fl3d.py` after inspecting the dataset’s CSV/JSON structure. Map to alert / microsleep / yawning (or binary) as needed for the temporal classifier.
