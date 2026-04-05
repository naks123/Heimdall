# Heimdall 🛡️

> **Intelligent driver drowsiness awareness powered by smartphone cameras, machine learning, and World ID.**

Heimdall is an experimental, mobile-first application designed to monitor drivers and detect early signs of fatigue—such as prolonged eye closure, frequent blinking, and yawning. It generates behavioral heuristics and issues real-time alertness warnings to support driver awareness. By integrating with World ID, we ensure 100% Sybil-resistant "Driving Credit" associated exclusively with unique, verified human drivers.

*Disclaimer: Heimdall is a hackathon prototype. It is **not** a medical or legal device. Any “possible impairment risk” label is a **rough behavioral heuristic** only.*

---

## 🌟 Key Features

- **Sybil-Resistant Driver Profiles**: Driver identities and lifelong safe-driving metrics are cryptographically secured using **World ID** zero-knowledge wallet authentication.
- **Mobile First Mini App**: Fully responsive, glassmorphic Next.js interface designed explicitly to run inside the native **World App** via the MiniKit SDK.
- **Real-Time Camera Integration**: HTML5 WebRTC-based facial tracking visualization directly out of the smartphone browser.
- **Admin Dashboard**: Live Vite & React dashboard for visualizing fleet sessions, user details, and overall risk factors in real time.

## 🏗️ Project Architecture & Structure

Heimdall adopts a monorepo setup ensuring shared logic and seamless scaling. The overarching structure is as follows:

| Component Path | Description |
|----------------|-------------|
| `world-mini-app/` | **Next.js World Mini App** — The core mobile interface using MiniKit SDK, NextAuth SIWE, and native camera APIs. |
| `web-admin/` | **React + Vite Dashboard** — administrative web panel proxies to the backend; visualizes metrics and fleet status. |
| `backend/` | **Fastify + TypeScript API** — central hub orchestrating logic, containing a lightweight JSON file store for simplicity. |
| `ml/` | **Inference Engine** — Python MediaPipe baseline, risk engine server, and experimental training scaffolds. |
| `mobile/` | **Legacy Expo App** — Original React Native prototype implementation. |
| `docs/` | **Project Documentation** — deeper dives into training the FL3D datasets. |

---

## 🚀 Getting Started

To spin up the modern Heimdall World Mini App locally and test it natively on your physical phone:

### 1. Start the HTTP Tunnel
Because World App requires a secure HTTPS connection or a public URL to communicate with your local machine, we use `ngrok`:
```bash
ngrok http 3000
```
*(Keep this terminal running. Copy the `https://...` forwarding URL it generates.)*

### 2. Configure Environment Variables
Inside the `world-mini-app/` directory, create or modify your `.env.local` file:
```env
NEXTAUTH_URL="<YOUR_NGROK_URL>/api/auth"
AUTH_SECRET="any_random_string_here_for_testing"
AUTH_TRUST_HOST="true"
```

### 3. Run the Mini App
In a new terminal window:
```bash
cd world-mini-app
npm install
npm run dev
```

### 4. Test on World App
1. Navigate to the **Worldcoin Developer Portal**.
2. Create an App/Action or open your existing Mini App configuration.
3. Paste your `ngrok` URL into the **App URL** testing field.
4. Open the physical **World App** on your iOS/Android smartphone.
5. Go to Settings -> Developer -> Scan the QR Code from the Developer Portal to instantly side-load the Mini App.
6. Interact with the landing page, click **Login with Wallet**, sign the secure SIWE challenge, and set up your personalized driver profile!

---

Built during a hackathon. Contributions, issue tickets, and ideas are heavily welcome!
