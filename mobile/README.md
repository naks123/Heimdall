# Heimdall mobile (Expo)

## Run

```bash
npm install
npx expo start
```

Then press **`a`** to open the **Android Emulator** (recommended for this project). The app defaults to **`http://10.0.2.2:3001`** so the emulator can reach the backend on your PC without putting a LAN IP in `.env`.

For **iOS Simulator**, set `EXPO_PUBLIC_API_BASE=http://127.0.0.1:3001`. For a **physical phone**, use LAN IP, or `adb reverse tcp:3001 tcp:3001` and `http://127.0.0.1:3001`.

## Config

- `EXPO_PUBLIC_API_BASE` — optional override; default targets **Android emulator** (`10.0.2.2`).
- Optional `EXPO_PUBLIC_GOOGLE_PLACES_KEY` — otherwise nearby stops are mocked.

## Android Emulator: use your real webcam (not the fake scene)

So the in-app camera shows **your face** from the PC’s webcam:

1. **Quit the emulator** completely (not just home).
2. Your AVD’s `config.ini` should set **`hw.camera.front=webcam0`** (host default camera). This repo includes `scripts/configure-emulator-webcam.ps1` to set that if your AVD lives at `%USERPROFILE%\.android\avd\Medium_Phone.avd\`.
3. Start the AVD again. In **Expo Go**, open Heimdall and allow camera — the preview should mirror your webcam.

If the preview is **black**, try **`webcam1`** (second camera) in `config.ini`, or another app may be locking the webcam. You can also set **Front camera → Webcam0** under the emulator’s **⋯** → **Virtual sensors** / **Camera** extended controls (varies by emulator version).

## Notes

- **Foreground**: continuous camera + sensors are oriented around an active “driving session”; background/lock-screen limitations on Android are platform-dependent — see Expo docs for production `foregroundService` if you extend beyond the hackathon.
- **Bluetooth** screen is a placeholder; video is not transported over Bluetooth.
