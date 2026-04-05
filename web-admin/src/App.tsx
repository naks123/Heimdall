import { Link, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import UserList from "./pages/UserList";
import UserDetail from "./pages/UserDetail";

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight text-white">
            Heimdall <span className="text-indigo-400">Admin</span>
          </Link>
          <p className="max-w-xl text-xs text-slate-500">
            Analytics only — not a medical or legal assessment tool. Experimental driver-fatigue metrics.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<UserList />} />
          <Route path="/users/:id" element={<UserDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
