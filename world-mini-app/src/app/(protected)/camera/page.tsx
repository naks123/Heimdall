'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

/* ── MediaPipe Face Mesh landmark indices (matches ml/infer/baseline.py) ────── */
const LEFT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];

/* Key mouth landmarks for MAR: left corner, top center lip, right corner, bottom center lip */
const MOUTH_TOP    = 13;   // upper lip centre
const MOUTH_BOTTOM = 14;   // lower lip centre
const MOUTH_LEFT   = 78;   // left corner
const MOUTH_RIGHT  = 308;  // right corner

/* ── Geometry helpers ──────────────────────────────────────────────────────── */
function dist(a: {x:number;y:number}, b: {x:number;y:number}) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(pts: {x:number;y:number}[]) {
  if (pts.length < 16) return 0.3;
  const H = dist(pts[0], pts[8]);
  if (H < 1e-6) return 0.3;
  let vSum = 0;
  for (let i = 1; i <= 7; i++) vSum += dist(pts[i], pts[16 - i]);
  return vSum / (7.0 * H);
}

function mouthAspectRatio(
  top: {x:number;y:number},
  bottom: {x:number;y:number},
  left: {x:number;y:number},
  right: {x:number;y:number},
) {
  const horizontal = dist(left, right);
  if (horizontal < 1e-6) return 0;
  return dist(top, bottom) / horizontal;
}

/* ── Thresholds (from ml/infer/baseline.py BaselineDrowsinessPipeline) ───── */
const EAR_CLOSED  = 0.18;
const EAR_OPEN    = 0.22;
const MAR_YAWN    = 0.55;   // raised vs Python's 0.38 to reduce false positives on webcam
const SEQ_LEN     = 8;
const PROLONGED_FRAMES  = 12;
const MICROSLEEP_FRAMES = 28;
const BLINK_COOLDOWN_MAX = 8;

export default function CameraDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);

  const [risk, setRisk] = useState(0);
  const maxRiskRef = useRef(0);
  const [yawns, setYawns] = useState(0);
  const [pec, setPec] = useState(0);
  const [monitorSec, setMonitorSec] = useState(0);
  const [statusText, setStatusText] = useState("Loading MediaPipe model…");

  const isRunning = useRef(true);
  const rafId = useRef(0);
  const landmarkerRef = useRef<any>(null);

  /* temporal state refs */
  const earHist = useRef<number[]>([]);
  const marHist = useRef<number[]>([]);
  const closedFrames = useRef(0);
  const blinkCooldown = useRef(0);
  const prevEar = useRef<number | null>(null);
  const pecCooldown = useRef(false);
  const yawnCooldown = useRef(0);
  const lastVideoTime = useRef(-1);
  const startedAt = useRef(Date.now());

  /* ── Prediction callback ──────────────────────────────────────────────────── */
  const predict = useCallback(() => {
    if (!isRunning.current) return;

    const video = videoRef.current;
    const lm = landmarkerRef.current;
    if (!video || !lm || video.readyState < 2) {
      rafId.current = requestAnimationFrame(predict);
      return;
    }

    setMonitorSec(Math.floor((Date.now() - startedAt.current) / 1000));
    let status = "Active monitoring. Driver alert.";

    if (video.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = video.currentTime;
      const result = lm.detectForVideo(video, performance.now());

      if (result.faceLandmarks?.length) {
        const lms = result.faceLandmarks[0];

        /* EAR */
        const leftEye  = LEFT_EYE.map((i: number) => lms[i]);
        const rightEye = RIGHT_EYE.map((i: number) => lms[i]);
        const ear = (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2.0;

        /* MAR — use the 4 canonical mouth points, NOT the first 4 of a long array */
        const mar = mouthAspectRatio(lms[MOUTH_TOP], lms[MOUTH_BOTTOM], lms[MOUTH_LEFT], lms[MOUTH_RIGHT]);

        /* history */
        earHist.current = [...earHist.current.slice(-(SEQ_LEN - 1)), ear];
        marHist.current = [...marHist.current.slice(-(SEQ_LEN - 1)), mar];

        /* eyes-closed score */
        const eyesOpen = Math.min(1, Math.max(0, (ear - EAR_CLOSED) / Math.max(1e-6, EAR_OPEN - EAR_CLOSED)));
        const eyesClosedScore = 1 - eyesOpen;

        /* blink detection */
        if (prevEar.current !== null && prevEar.current > EAR_OPEN && ear < EAR_CLOSED) {
          if (blinkCooldown.current <= 0) {
            blinkCooldown.current = BLINK_COOLDOWN_MAX;
            status = "Blink detected.";
          }
        }
        prevEar.current = ear;
        if (blinkCooldown.current > 0) blinkCooldown.current--;

        /* prolonged closure / microsleep */
        if (ear < EAR_CLOSED) closedFrames.current++;
        else closedFrames.current = Math.max(0, closedFrames.current - 1);

        if (closedFrames.current >= PROLONGED_FRAMES && !pecCooldown.current) {
          status = "⚠ Prolonged eye closure!";
          setPec(p => p + 1);
          pecCooldown.current = true;
        }
        if (closedFrames.current < PROLONGED_FRAMES) pecCooldown.current = false;

        /* yawn detection — smoothed MAR with debounce */
        const marSmooth = marHist.current.reduce((a, b) => a + b, 0) / marHist.current.length;
        const yawnScore = Math.min(1, Math.max(0, (marSmooth - 0.30) / Math.max(1e-6, MAR_YAWN - 0.30)));

        if (yawnCooldown.current > 0) yawnCooldown.current--;
        if (marSmooth > MAR_YAWN && yawnCooldown.current <= 0) {
          setYawns(y => y + 1);
          status = "Yawn detected.";
          yawnCooldown.current = 30; // ~30 frames cooldown between yawn counts
        }

        /* composite scores (from baseline.py) */
        const drowsinessScore = Math.min(1, Math.max(0,
          0.45 * eyesClosedScore + 0.35 * yawnScore + 0.20 * Math.min(1, closedFrames.current / 30),
        ));
        const impairment = Math.min(0.35, Math.max(0,
          0.12 * drowsinessScore + 0.55 * eyesClosedScore + 0.08 * yawnScore,
        ));
        const riskPct = Math.round((impairment / 0.35) * 100);

        setRisk(old => {
          const next = Math.round(old * 0.92 + riskPct * 0.08); // smooth
          maxRiskRef.current = Math.max(maxRiskRef.current, next);
          return next;
        });
      } else {
        status = "No face detected — look at the camera.";
      }
      setStatusText(status);
    }
    rafId.current = requestAnimationFrame(predict);
  }, []);

  /* ── Initialise camera + MediaPipe ────────────────────────────────────────── */
  useEffect(() => {
    let stream: MediaStream | null = null;
    isRunning.current = true;
    startedAt.current = Date.now();

    const init = async () => {
      /* Dynamic import — avoids Next.js SSR crash */
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      setStatusText("Model loaded. Waiting for camera…");

      /* Camera */
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", () => {
            setStatusText("Tracking active.");
            rafId.current = requestAnimationFrame(predict);
          });
        }
        if (isRunning.current) setHasPermission(true);
      } catch {
        if (isRunning.current) setHasPermission(false);
      }

      /* Backend session */
      if (!isRunning.current) return;
      try {
        const res = await fetch('/api/sessions', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session?.user?.id }),
        });
        const j = await res.json();
        if (j.id) setBackendSessionId(j.id);
      } catch {}
    };
    init();

    return () => {
      isRunning.current = false;
      cancelAnimationFrame(rafId.current);
      stream?.getTracks().forEach(t => t.stop());
      landmarkerRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── End session ──────────────────────────────────────────────────────────── */
  const endSessionAndReturn = async () => {
    isRunning.current = false;
    cancelAnimationFrame(rafId.current);
    setStatusText("Saving metrics…");
    if (backendSessionId) {
      try {
        await fetch(`/api/sessions/${backendSessionId}/end`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            totalDriveDurationSec: monitorSec,
            monitoringDurationSec: monitorSec,
            yawnCount: yawns,
            prolongedEyeClosureCount: pec,
            blinkCount: yawns + pec,
            drowsyPercent: 0,
            maxRiskScore: maxRiskRef.current / 100,
          }),
        });
      } catch {}
    }
    router.push('/home');
  };

  /* ── Render ───────────────────────────────────────────────────────────────── */
  const riskLevel = Math.round(risk);
  const liveRiskColor = riskLevel > 60 ? "text-risk-text" : (riskLevel > 30 ? "text-warn-text" : "text-safe-text");
  const liveBg = riskLevel > 80 ? "bg-risk-bg" : "bg-page";

  return (
    <main className={`min-h-screen ${liveBg} text-primary flex flex-col p-6 transition-colors duration-500`}>
      <header className="flex items-center justify-between mt-2 mb-6">
        <button onClick={endSessionAndReturn} className="px-3 py-2 border border-border bg-surface rounded text-[12px] font-medium flex gap-2 items-center text-secondary hover:text-primary hover:border-border-2 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          End Trip
        </button>
        <span className="font-mono text-[11px] text-safe-text border border-safe-border bg-safe-bg px-2 py-1 rounded">
           LIVE
        </span>
      </header>

      <section className="flex-1 flex flex-col items-center">
        {hasPermission === false && (
          <div className="bg-risk-bg border border-risk-border text-risk-text p-4 rounded text-center w-full mb-4">
            <h2 className="font-bold text-sm mb-1">Camera Blocked</h2>
            <p className="text-[12px]">Please allow camera permissions to monitor driving.</p>
          </div>
        )}

        <div className="relative w-full max-w-sm aspect-[3/4] bg-surface rounded overflow-hidden border border-border">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-60"
          />

          <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
            <div className="bg-surface px-2 py-1.5 rounded border border-border">
              <span className="text-[11px] font-mono text-link">{monitorSec}s</span>
            </div>
            <div className="bg-surface px-3 py-2 rounded border border-border text-center">
              <span className="block text-[9px] uppercase text-muted font-bold tracking-widest">Risk</span>
              <span className={`block text-xl font-mono font-bold ${liveRiskColor}`}>{riskLevel}%</span>
            </div>
          </div>

          <div className="absolute bottom-3 left-3 right-3 bg-surface border border-border rounded p-4">
            <div className="flex justify-between items-end mb-2">
              <div>
                <span className="block text-2xl font-mono text-warn-text">{yawns}</span>
                <span className="text-[9px] uppercase text-muted font-bold tracking-widest">Yawns</span>
              </div>
              <div className="text-right">
                <span className="block text-2xl font-mono text-risk-text">{pec}</span>
                <span className="text-[9px] uppercase text-muted font-bold tracking-widest">Microsleeps</span>
              </div>
            </div>
            <p className="font-mono text-[10px] text-link mt-3 pt-2 border-t border-border">{statusText}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
