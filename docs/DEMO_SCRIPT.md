# Heimdall — 2–3 minute hackathon demo

## Before the demo (30 seconds)

1. Terminal A: `cd backend && npm run dev` (API on port 3001; seed data already in `data/store.json`, or run `npm run seed`).
2. Terminal B: `cd web-admin && npm run dev` — open `http://localhost:5173`.
3. Terminal C (optional): `cd ml && uvicorn serve_inference:app --host 127.0.0.1 --port 5055` with `HEIMDALL_MOCK_INFERENCE=1` for Python API without MediaPipe.
4. Mobile: `cd mobile && npx expo start` — press **`a`** for **Android Emulator** (API defaults to `10.0.2.2:3001` → backend on your PC).

## Minute 1 — Mobile

1. Open **Heimdall Drive** in the **emulator** (or Expo Go on a device if you override the API URL).
2. Grant **camera** and **notifications** when prompted.
3. Tap **Simulate driving session** (motion-based driving is also available by physically moving the phone).
4. Point the front camera at your face; watch the **risk** percentage and **status chip** (Monitoring).
5. Within ~10–20 seconds the demo polls the backend and risk rises; **notification + TTS + haptic** may fire — explain these are assistive, not diagnostic.

## Minute 2 — Session end & report

1. Tap **End session**.
2. A **summary notification** appears; open the **Session report** screen with duration, yawn / prolonged closure counts (synthetic in this build), and disclaimer copy.

## Minute 3 — Admin dashboard

1. In the browser, open the admin UI (list of seeded users).
2. Search by name, change **sort** (highest score, recent session, etc.).
3. Click a user → **trend charts** and aggregate stats.
4. Mention **Gautschi**: Slurm scripts under `scripts/` and `docs/gautschi.md` for FL3D training when the dataset is downloaded.

## One-liner pitch

“We combine on-device camera and motion context with a risk engine and optional FL3D training path to surface **signs of drowsiness** during driving — with clear **non-medical** disclaimers and an admin view for fleet-style analytics.”
