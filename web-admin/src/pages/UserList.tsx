import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchUsers, type User } from "../api";

const sorts = [
  { id: "", label: "Name" },
  { id: "score_high", label: "Highest score" },
  { id: "score_low", label: "Lowest score" },
  { id: "recent_session", label: "Most recent session" },
  { id: "highest_risk", label: "Highest risk sessions" },
] as const;

export default function UserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUsers(search, sort)
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [search, sort]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Users</h1>
      <div className="mt-6 flex flex-wrap gap-4">
        <input
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500"
          placeholder="Search name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {sorts.map((s) => (
            <option key={s.id || "name"} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {err && <p className="mt-4 text-amber-400">{err} — Is the backend running on :3001?</p>}
      <div className="mt-8 overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Driving score</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                <td className="px-4 py-3">
                  <Link to={`/users/${u.id}`} className="text-indigo-400 hover:underline">
                    {u.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-400">{u.email}</td>
                <td className="px-4 py-3 font-mono text-emerald-400">{(u.overallDrivingScore * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
