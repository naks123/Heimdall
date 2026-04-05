'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileName, setProfileName] = useState("World ID Driver");
  const [lifetime, setLifetime] = useState({ 
    sessionCount: 0, ms: 0, yawns: 0, pec: 0, 
    avgSafetyScore: 100, peakRiskScore: 0, avgDrowsyPercent: 0, status: "Safe" 
  });
  const [inputName, setInputName] = useState("");
  const [inputCompany, setInputCompany] = useState("");

  useEffect(() => {
    if (!session?.user?.id) return;
    const fetchUser = async () => {
      try {
        // 1. Check Profile
        const rProfile = await fetch(`/api/users/${session.user.id}`);
        if (rProfile.status === 404) {
          setNeedsOnboarding(true);
          setLoading(false);
          return;
        }
        const profileData = await rProfile.json();
        setProfileName(profileData.name || "World ID Driver");
        
        // 2. Load Stats
        const rStats = await fetch(`/api/users/${session.user.id}/stats`);
        const statsData = await rStats.json();
        setLifetime({ 
          sessionCount: statsData.sessionCount || 0, 
          ms: statsData.lifetimeTimeSec || 0, 
          yawns: statsData.lifetimeYawns || 0, 
          pec: statsData.lifetimePec || 0,
          avgSafetyScore: statsData.avgSafetyScore ?? 100,
          peakRiskScore: statsData.peakRiskScore || 0,
          avgDrowsyPercent: statsData.avgDrowsyPercent || 0,
          status: statsData.status || "Safe",
        });
        setLoading(false);
      } catch (err) {
        setLoading(false);
      }
    };
    fetchUser();
  }, [session?.user?.id]);

  const submitProfile = async () => {
    if (!inputName.trim() || !session?.user?.id) return;
    try {
      await fetch(`/api/users/${session.user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inputName.trim(), company: inputCompany.trim() }),
      });
      setProfileName(inputName.trim());
      setNeedsOnboarding(false);
    } catch(e) {}
  };

  if (loading) return <main className="min-h-screen bg-page flex items-center justify-center text-link font-mono text-xs tracking-widest uppercase">Initializing Secure Module...</main>;

  if (needsOnboarding) {
    return (
      <main className="min-h-screen bg-page text-primary flex flex-col p-6 items-center justify-center">
        <div className="flex flex-col w-full max-w-sm p-6 bg-surface border border-border rounded-md">
          <h1 className="text-xl font-bold mb-1 text-primary">Fleet Driver Registration</h1>
          <p className="text-muted text-[12px] mb-6">
            Secure driver verification tied to World ID.
          </p>
          
          <input 
            type="text" 
            placeholder="e.g. Alan, Alpha Fleet #4"
            className="w-full px-3 py-2.5 rounded mb-4 bg-surface text-primary border border-border-2 focus:outline-none focus:border-link font-sans text-sm"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
          />
          <input 
            type="text" 
            placeholder="Company ID or Name (e.g. amazon)"
            className="w-full px-3 py-2.5 rounded mb-4 bg-surface text-primary border border-border-2 focus:outline-none focus:border-link font-sans text-sm"
            value={inputCompany}
            onChange={(e) => setInputCompany(e.target.value)}
          />
          <button 
            onClick={submitProfile} 
            disabled={!inputName.trim()}
            className="w-full py-2.5 rounded font-bold bg-surface-2 text-primary text-[13px] disabled:opacity-50 disabled:cursor-not-allowed border border-border hover:border-link transition-colors flex items-center justify-center gap-2"
          >
             Secure Verification
          </button>
        </div>
      </main>
    );
  }

  const scoreColor = lifetime.avgSafetyScore >= 70 ? "text-safe-text" : (lifetime.avgSafetyScore >= 60 ? "text-warn-text" : "text-risk-text");
  const statusBg = lifetime.status === "Safe" ? "bg-safe-bg border-safe-border text-safe-text" : (lifetime.status === "Attention" ? "bg-warn-bg border-warn-border text-warn-text" : "bg-risk-bg border-risk-border text-risk-text");

  return (
    <main className="min-h-screen text-primary p-6 flex flex-col gap-6 bg-page overflow-y-auto pb-24 font-sans">
      <header className="mb-2 mt-2">
        <h1 className="text-[20px] font-bold tracking-tight text-primary">Fleet Dashboard</h1>
        <p className="text-[13px] text-muted mb-4">Driver Awareness System</p>
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 bg-safe-bg border border-safe-border px-3 py-1.5 rounded">
            <span className="w-1.5 h-1.5 bg-safe-text rounded-full"></span>
            <span className="text-[11px] font-medium text-safe-text font-mono">
              Verified: {profileName}
            </span>
          </div>
          <div className={`inline-flex items-center px-3 py-1.5 rounded border text-[11px] font-bold tracking-wider uppercase ${statusBg}`}>
            {lifetime.status}
          </div>
        </div>
      </header>

      {/* Driver Score */}
      <section className="shrink-0 flex items-center justify-between bg-surface border border-border rounded p-6">
        <div>
          <h2 className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Overall Safety Score</h2>
          <p className="text-[11px] text-muted mt-1 leading-relaxed">Cumulative rating across {lifetime.sessionCount} sessions.</p>
        </div>
        <div className="text-right">
          <div className={`text-[42px] font-mono leading-none ${scoreColor}`}>
            {lifetime.avgSafetyScore}
          </div>
        </div>
      </section>

      {/* Advanced Metrics */}
      <section className="shrink-0 flex flex-col gap-3">
        <h2 className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Trip Metrics</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface border border-border rounded p-4 flex flex-col">
            <span className="text-[10px] text-muted tracking-widest uppercase mb-1">Avg Drowsy</span>
            <span className="text-[26px] font-mono font-medium">{lifetime.avgDrowsyPercent}%</span>
          </div>
          <div className="bg-surface border border-border rounded p-4 flex flex-col">
            <span className="text-[10px] text-muted tracking-widest uppercase mb-1">Peak Risk</span>
            <span className="text-[26px] font-mono font-medium">{lifetime.peakRiskScore.toFixed(2)}</span>
          </div>
          <div className="bg-surface border border-border rounded p-4 flex flex-col">
            <span className="text-[10px] text-muted tracking-widest uppercase mb-1">Mins Tracked</span>
            <span className="text-[26px] font-mono font-medium">{Math.round(lifetime.ms / 60)}</span>
          </div>
          <div className="bg-surface border border-border rounded p-4 flex flex-col">
            <span className="text-[10px] text-muted tracking-widest uppercase mb-1">Safe Trips</span>
            <span className="text-[26px] font-mono font-medium text-safe-text">{lifetime.sessionCount}</span>
          </div>
        </div>
      </section>

      {/* Main Action Button */}
      <section className="shrink-0 my-2">
        <button
          onClick={() => router.push('/camera')}
          className="w-full py-3 rounded text-[13px] tracking-wide transition-colors flex items-center justify-center gap-2 bg-surface text-primary border border-border-2 hover:border-link font-sans"
        >
          START TRACKING NOW
        </button>
      </section>

      {/* World ID Explanation */}
      <section className="shrink-0 bg-surface-2 rounded p-5 border border-border mt-auto">
        <h2 className="text-[11px] font-bold tracking-[0.06em] text-secondary uppercase mb-2">
          Sybil Resistance
        </h2>
        <p className="text-[12px] text-muted leading-relaxed">
          Your "Driving Credit" is cryptographically tied to your anonymous World Wallet address, making your metrics completely sybil-resistant and secure for fleet evaluation.
        </p>
      </section>
      
      <div className="text-[11px] text-muted leading-loose mb-2">
        Analytics only. Not a medical or legal assessment.
      </div>
    </main>
  );
}
