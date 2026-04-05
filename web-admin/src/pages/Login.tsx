import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
      <h1 className="text-xl font-semibold text-white">Demo login</h1>
      <p className="mt-2 text-sm text-slate-400">Hackathon mode: no password. Admin API uses header token.</p>
      <button
        type="button"
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white hover:bg-indigo-500"
        onClick={() => nav("/")}
      >
        Continue as admin
      </button>
    </div>
  );
}
