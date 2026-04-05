# Heimdall — driver drowsiness awareness (hackathon)

Smartphone-first monitoring with **experimental** fatigue signals (blinks, prolonged eye closure, yawning, rough drowsiness score). **Not** a medical or legal device. Any “possible impairment risk” label is a **rough behavioral heuristic** only.

## Repo layout

| Path | Purpose |
|------|---------|
| `mobile/` | Expo (React Native) app — camera, motion heuristics, alerts, session report |
| `web-admin/` | Vite + React admin dashboard (seeded demo data) |
| `backend/` | Fastify + TypeScript + JSON file store (no native DB build) |
| `ml/` | MediaPipe baseline, risk engine, FL3D training scaffolds, inference server |
| `scripts/` | Slurm + shell helpers for cluster / webcam |
| `docs/` | FL3D notes, Gautschi, demo script |

## Quick start (local demo)

### 1. Backend API

```bash
cd backend
npm install
npm run seed    # writes data/store.json with 10 fake users + sessions
npm run dev     # http://127.0.0.1:3001
```

Health: `GET http://127.0.0.1:3001/health`

Admin list: `GET http://127.0.0.1:3001/admin/users` with header `X-Admin-Token: demo-admin`

### 2. Admin web

```bash
cd web-admin
npm install
npm run dev     # http://127.0.0.1:5173 — proxies /api → backend
```

### 3. ML (optional for demo)

```bash
cd ml
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
set HEIMDALL_MOCK_INFERENCE=1
uvicorn serve_inference:app --host 127.0.0.1 --port 5055
```

Webcam (requires MediaPipe): `python ml/scripts/infer_webcam.py --camera 0`

### 4. Mobile (Expo + Android Emulator)

```bash
cd mobile
npm install
npx expo start
```

Press **`a`** to open the **Android Emulator**. Defaults to **`http://10.0.2.2:3001`** so the app reaches the backend on your PC without a `.env`. For **iOS Simulator**, set `EXPO_PUBLIC_API_BASE=http://127.0.0.1:3001`. See `mobile/README.md` for physical devices.

## Runtime modes

1. **Full demo** — backend seed + web admin + mobile with `/infer/mock` (no Python required).
2. **Local CV** — run `uvicorn` + MediaPipe; point future integrations at `POST /infer` on port 5055.
3. **Training** — FL3D preprocess/train scaffolds; real training after Kaggle download (`docs/dataset_fl3d.md`).
4. **Gautschi** — `sbatch scripts/train_fl3d.slurm` (edit partition/modules); see `docs/gautschi.md`.

## Secrets / keys (optional)

| Item | Required? |
|------|-----------|
| Kaggle API for FL3d | Only for dataset download |
| `EXPO_PUBLIC_GOOGLE_PLACES_KEY` | Optional — mock stops work without it |
| MongoDB | **Not used** — persistence is JSON file in `backend/data/` |

## Project status checklist

- [x] Monorepo scaffold + shared API types (`shared/api-types.ts`)
- [x] Risk engine (Python) + `config/risk_defaults.yaml` + pytest
- [x] MediaPipe baseline inference + mock inference server
- [x] FL3D preprocess/train/eval stubs + dataset docs
- [x] Backend REST + seed + mock auth header for admin
- [x] Admin dashboard + charts + filters
- [x] Expo app: camera, simulate driving, polling, notifications, TTS, haptics, report, Bluetooth placeholder
- [x] Gautschi Slurm templates + `docs/gautschi.md`
- [x] `docs/DEMO_SCRIPT.md`

## Major compromises

- **Backend storage**: JSON file instead of SQLite to avoid native `better-sqlite3` compile issues on Windows without VS Build Tools.
- **Mobile ↔ ML**: Phone uses REST `/infer/mock` by default; full frame streaming to Python is optional (would use LAN IP + `POST /infer` with base64 JPEG).
- **Driving detection**: Accelerometer heuristic + **“Simulate driving”** button for reliable stage demos.
- **FL3D training**: Stub pipeline until the dataset is extracted and manifest populated.

## Commands summary

| Service | Command |
|---------|---------|
| Backend | `cd backend && npm run dev` |
| Web admin | `cd web-admin && npm run dev` |
| ML API (mock) | `cd ml && set HEIMDALL_MOCK_INFERENCE=1 && uvicorn serve_inference:app --port 5055` |
| Mobile | `cd mobile && npx expo start` |
| Gautschi train | `sbatch scripts/train_fl3d.slurm` (after editing for your partition) |

See **`docs/DEMO_SCRIPT.md`** for a 2–3 minute presentation flow.
