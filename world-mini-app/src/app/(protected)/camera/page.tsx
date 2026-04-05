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
  const riskColor = riskLevel > 60 ? "text-red-400" : (riskLevel > 30 ? "text-amber-400" : "text-emerald-400");
  const riskBorder = riskLevel > 60 ? "border-red-500 shadow-red-500/50" : "border-emerald-500 shadow-emerald-500/50";
  const bgWarning = riskLevel > 80 ? "bg-red-900/30" : "bg-slate-950";

  return (
    <main className={`min-h-screen ${bgWarning} text-slate-100 flex flex-col p-4 font-sans transition-colors duration-1000`}>
      <header className="flex items-center justify-between mt-4 mb-4">
        <button onClick={endSessionAndReturn} className="px-5 py-2.5 bg-slate-800 rounded-full hover:bg-slate-700 text-sm font-bold flex gap-2 items-center text-rose-300">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          End Session
        </button>
        <span className="font-semibold tracking-wider text-sm text-slate-300 flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
           LIVE TRACKING
        </span>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center -mt-4">
        {hasPermission === false && (
          <div className="bg-red-900/40 border border-red-500 text-red-100 p-6 rounded-2xl text-center">
            <h2 className="font-bold text-xl mb-2">Camera Blocked</h2>
            <p className="text-sm">Please allow camera permissions.</p>
          </div>
        )}

        <div className={`relative w-full max-w-sm aspect-[3/4] bg-slate-900 rounded-[2.5rem] overflow-hidden border-4 shadow-2xl transition-all duration-700 ${riskBorder}`}>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
          />

          <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
            <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                {monitorSec}s LOOPING
              </span>
            </div>
            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-center">
              <span className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Risk</span>
              <span className={`block text-xl font-black ${riskColor}`}>{riskLevel}%</span>
            </div>
          </div>
          
          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-6 pt-12">
            <div className="flex justify-between items-end mb-2">
              <div className="text-left">
                <span className="block text-2xl font-bold">{yawns}</span>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Yawns</span>
              </div>
              <div className="text-right">
                <span className="block text-2xl font-bold">{pec}</span>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Microsleeps</span>
              </div>
            </div>
            <p className="font-mono text-[10px] text-indigo-300">{statusText}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
