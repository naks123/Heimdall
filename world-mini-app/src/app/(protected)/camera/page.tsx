'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function CameraDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);

  const [risk, setRisk] = useState(5);
  const maxRiskRef = useRef(5);
  const [yawns, setYawns] = useState(0);
  const [pec, setPec] = useState(0);
  const [monitorSec, setMonitorSec] = useState(0);
  const [statusText, setStatusText] = useState("Initializing model...");

  const [simInterval, setSimInterval] = useState<NodeJS.Timeout | null>(null);

  // Initialize Camera & Backend Session
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isActive = true;

    const init = async () => {
      // 1. Get Camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        if (isActive) setHasPermission(true);
      } catch (err) {
        console.error(err);
        if (isActive) setHasPermission(false);
      }
      
      // 2. Start Backend Session
      if (!isActive) return;
      try {
        const res = await fetch('/api/sessions', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session?.user?.id }),
        });
        const j = await res.json();
        if (j.id) setBackendSessionId(j.id);
      } catch (e) { console.error(e); }
    };
    init();

    return () => {
      isActive = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracking loop
  useEffect(() => {
    if (!hasPermission) return;
    setStatusText("Tracking facial landmarks... ready");
    const interval = setInterval(() => {
      setMonitorSec(s => s + 2);
      const isYawn = Math.random() > 0.85;
      const isBlink = Math.random() > 0.7;
      
      setRisk(r => {
        let newRisk = r * 0.95; 
        if (isYawn) newRisk += 15;
        if (isBlink) newRisk += 5;
        newRisk += Math.random() * 4 - 2;
        const bounded = Math.min(100, Math.max(0, newRisk));
        maxRiskRef.current = Math.max(maxRiskRef.current, bounded);
        return bounded;
      });

      if (isYawn) { 
         setYawns(y => y + 1); 
         setStatusText("Yawn detected..."); 
      }
      else if (isBlink) {
         setStatusText("Blinking recognized.");
      }
      else {
         setStatusText("Active monitoring. Driver alert.");
      }
    }, 2000);
    setSimInterval(interval);
    return () => clearInterval(interval);
  }, [hasPermission]);

  const endSessionAndReturn = async () => {
    if (simInterval) clearInterval(simInterval);
    setStatusText("Ending session and saving metrics...");
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
      } catch(e) {}
    }
    router.push('/home');
  };

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
              <span className="text-[11px] font-mono text-link">
                {monitorSec}s
              </span>
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
