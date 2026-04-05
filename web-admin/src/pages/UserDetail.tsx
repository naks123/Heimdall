import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { fetchUserDetail, type DrivingSession } from "../api";
import { formatDurationHuman, getSessionDurationSec } from "../formatDuration";

export default function UserDetail() {
  const { id } = useParams();
  const [data, setData] = useState<{ sessions: DrivingSession[]; user: { name: string; overallDrivingScore: number } } | null>(
    null
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchUserDetail(id)
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  if (err) return <p className="text-amber-400">{err}</p>;
  if (!data) return <p className="text-slate-400">Loading…</p>;

  const chartData = [...data.sessions]
    .reverse()
    .slice(-12)
    .map((s, i) => ({
      name: `S${i + 1}`,
      risk: s.metrics?.maxRiskScore ?? 0,
      drowsy: s.metrics?.drowsyPercent ?? 0,
    }));

  const totalYawns = data.sessions.reduce((a, s) => a + (s.metrics?.yawnCount ?? 0), 0);
  const totalPec = data.sessions.reduce((a, s) => a + (s.metrics?.prolongedEyeClosureCount ?? 0), 0);

  return (
    <div>
      <Link to="/" className="text-sm text-indigo-400 hover:underline">
        ← Users
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-white">{data.user.name}</h1>
      <p className="text-slate-400">
        Overall driving score:{" "}
        <span className="font-mono text-emerald-400">{(data.user.overallDrivingScore * 100).toFixed(0)}%</span>
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase text-slate-500">Yawns (all sessions)</p>
          <p className="text-2xl font-semibold text-white">{totalYawns}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase text-slate-500">Prolonged eye closures</p>
          <p className="text-2xl font-semibold text-white">{totalPec}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase text-slate-500">Sessions</p>
          <p className="text-2xl font-semibold text-white">{data.sessions.length}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-slate-300">Driving sessions</h2>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Max risk</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => {
                const sec = getSessionDurationSec(s);
                const started = new Date(s.startedAt);
                return (
                  <tr key={s.id} className="border-t border-slate-800">
                    <td className="px-4 py-3 text-slate-300">
                      {started.toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{formatDurationHuman(sec)}</td>
                    <td className="px-4 py-3 capitalize text-slate-400">{s.status}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {s.metrics?.maxRiskScore != null ? `${(s.metrics.maxRiskScore * 100).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Duration uses stored trip length when available, otherwise the time from start to end of session.
        </p>
      </div>

      <div className="mt-8 h-72 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-300">Risk & drowsy % trend</h2>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
            <Line type="monotone" dataKey="risk" stroke="#818cf8" name="Max risk" />
            <Line type="monotone" dataKey="drowsy" stroke="#f472b6" name="Drowsy %" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-8 h-64 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-300">Session max risk (bar)</h2>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
            <Bar dataKey="risk" fill="#6366f1" name="Max risk" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-8 rounded-xl border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-100/90">
        <strong>Flags / recommendations:</strong> If prolonged eye closures cluster in late sessions, consider shorter trips or
        planned breaks. This dashboard does not diagnose medical conditions.
      </div>
    </div>
  );
}
