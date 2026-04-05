import { AuthButton } from '@/components/AuthButton';

export default function HomeLanding() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      
      {/* Decorative Background Glows */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full"></div>
      </div>

      <div className="flex-1 max-w-xl mx-auto px-6 py-12 flex flex-col gap-10">
        
        {/* Header Section */}
        <header className="flex flex-col items-center text-center mt-8 gap-4 animate-fade-in-down">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-xl shadow-indigo-500/30 flex items-center justify-center mb-2">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.477 2 2 6.477 2 12c0 5.522 4.477 10 10 10s10-4.478 10-10C22 6.477 17.523 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
            Heimdall
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed font-medium">
            Build your verifiable driving reputation. Prove you're safe, securely and privately.
          </p>
        </header>

        {/* Feature Cards Section */}
        <div className="flex flex-col gap-4 mt-4">
          
          <div className="group relative bg-slate-900/50 backdrop-blur-md rounded-3xl p-6 border border-slate-800 transition-all hover:bg-slate-800/80 hover:border-indigo-500/50">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-3 mb-2">
              <span className="text-2xl">👤</span> Safe from Bots
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              <strong>Proof of Personhood:</strong> Only real humans can earn driving credit. By integrating with World ID, we ensure no one can spoof safety scores with AI videos or fake accounts.
            </p>
          </div>

          <div className="group relative bg-slate-900/50 backdrop-blur-md rounded-3xl p-6 border border-slate-800 transition-all hover:bg-slate-800/80 hover:border-emerald-500/50">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-3 mb-2">
              <span className="text-2xl">🛡️</span> Total Privacy
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              <strong>Zero-Knowledge Security:</strong> Your driving credit is attached to an anonymous cryptographic wallet. You prove you're a great driver without revealing your real-world identity or surveillance.
            </p>
          </div>

          <div className="group relative bg-slate-900/50 backdrop-blur-md rounded-3xl p-6 border border-slate-800 transition-all hover:bg-slate-800/80 hover:border-purple-500/50">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-3 mb-2">
              <span className="text-2xl">🏆</span> Verifiable Credit
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              <strong>On-Chain Attestations:</strong> Earn driving credentials for staying alert. Export your "Driving Credit" as a verified token to access insurance discounts or premium delivery gigs natively inside World App.
            </p>
          </div>

        </div>

        {/* Call to action */}
        <div className="mt-6 flex flex-col items-center gap-4">
          <p className="text-sm font-medium text-slate-500 mb-2">Ready to secure your reputation?</p>
          <div className="w-full transform transition-transform hover:scale-[1.02] active:scale-95">
             <AuthButton />
          </div>
        </div>

      </div>
    </main>
  );
}
