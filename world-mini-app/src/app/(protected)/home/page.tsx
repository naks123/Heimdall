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
  const [lifetime, setLifetime] = useState({ sessionCount: 0, ms: 0, yawns: 0, pec: 0 });
  const [inputName, setInputName] = useState("");

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
          pec: statsData.lifetimePec || 0 
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
        body: JSON.stringify({ name: inputName.trim() }),
      });
      setProfileName(inputName.trim());
      setNeedsOnboarding(false);
    } catch(e) {}
  };

  if (loading) return <main className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-400 font-mono text-xs tracking-widest uppercase">Initializing Secure Module...</main>;

  if (needsOnboarding) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 items-center justify-center overflow-hidden relative">
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-600/20 blur-[100px] rounded-full pointer-events-none"></div>
        
        <div className="flex flex-col items-center animate-fade-in-down z-10 w-full max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/30">
             <span className="text-3xl">🪪</span>
          </div>
          <h1 className="text-3xl font-black mb-3 text-white text-center tracking-tight">Create Profile</h1>
          <p className="text-slate-400 text-sm mb-8 text-center leading-relaxed">
            Your driving credit is secured cryptographically. <br/>What should your fleet manager call you?
          </p>
          
          <input 
            type="text" 
            placeholder="e.g. Alan, Alpha Fleet #4"
            className="w-full p-4 rounded-xl bg-slate-900/80 border border-slate-700/50 text-white placeholder-slate-500 shadow-xl mb-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:border-indigo-500 transition-all"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
          />
          <button 
            onClick={submitProfile} 
            disabled={!inputName.trim()}
            className="w-full py-4 mt-2 rounded-2xl font-bold bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed border-2 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:bg-slate-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
             Secure My Identity
             <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-slate-100 p-6 flex flex-col gap-8 bg-slate-900 transition-colors duration-1000 overflow-y-auto pb-24">
      <header className="flex items-center justify-between mt-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-md">Heimdall</h1>
          </div>
          <p className="text-xs text-indigo-300/80 font-medium tracking-wide mt-1 uppercase">Driver Awareness System</p>
          <div className="mt-3 flex items-center gap-2 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20 w-fit backdrop-blur-md">
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse shadow-[0_0_8px_#818cf8]"></span>
            <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
              Verified: {profileName}
            </span>
          </div>
        </div>
      </header>

      {/* Lifetime Stats */}
      <section className="shrink-0 bg-slate-800/40 rounded-3xl p-6 border border-slate-700/50 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </div>
        <h2 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4">Lifetime Driver Metrics</h2>
        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
            <span className="block text-3xl font-black text-indigo-400">{Math.round(lifetime.ms / 60)}</span>
            <span className="text-[10px] uppercase font-bold text-slate-500">Total Minutes</span>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
            <span className="block text-3xl font-black text-emerald-400">{lifetime.sessionCount}</span>
            <span className="text-[10px] uppercase font-bold text-slate-500">Safe Trips</span>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
            <span className="block text-3xl font-black text-amber-400">{lifetime.yawns}</span>
            <span className="text-[10px] uppercase font-bold text-slate-500">Yawns Logged</span>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
            <span className="block text-3xl font-black text-red-400">{lifetime.pec}</span>
            <span className="text-[10px] uppercase font-bold text-slate-500">Micro-Sleeps</span>
          </div>
        </div>
      </section>

      {/* Main Action Button */}
      <section className="shrink-0 flex flex-col gap-3 justify-center">
        <button
          onClick={() => router.push('/camera')}
          className="w-full py-5 rounded-2xl text-xl font-extrabold shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all active:scale-95 flex items-center justify-center gap-3 bg-slate-800 border-2 border-indigo-500 text-white hover:bg-slate-700"
        >
          <svg className="w-6 h-6 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          START TRACKING NOW
        </button>
      </section>

      {/* World ID Explanation */}
      <section className="shrink-0 bg-gradient-to-tr from-indigo-900/40 to-purple-900/40 rounded-3xl p-6 border border-indigo-500/20 shadow-lg">
        <h2 className="text-sm font-bold tracking-widest text-indigo-300 uppercase mb-2 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          Why World ID?
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Your "Driving Credit" is extremely valuable. By authenticating with <strong className="text-white">World ID</strong>, 
          Heimdall prevents bad actors from spinning up bot accounts or replaying sleepy videos to farm fake credit scores. 
          Your lifetime metrics above are 100% Sybil-resistant and cryptographically tied purely to your anonymous World Wallet address.
        </p>
      </section>
      
      <div className="shrink-0 text-center text-[10px] text-slate-600 mb-2">
        Disclaimer: This is an experimental behavioral heuristic. Not for medical or legal assessment.
      </div>
    </main>
  );
}
