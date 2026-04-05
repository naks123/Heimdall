const BASE = "/api";

export interface User {
  id: string;
  name: string;
  email: string;
  overallDrivingScore: number;
  createdAt: string;
}

export interface SessionMetrics {
  totalDriveDurationSec: number;
  monitoringDurationSec: number;
  yawnCount: number;
  prolongedEyeClosureCount: number;
  blinkCount?: number;
  drowsyPercent: number;
  maxRiskScore: number;
  eventCounts?: Record<string, number>;
}

export interface DrivingSession {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  metrics: SessionMetrics | null;
}

const headers = () => ({
  "Content-Type": "application/json",
  "X-Admin-Token": "demo-admin",
});

export async function fetchUsers(search: string, sort: string): Promise<User[]> {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  if (sort) q.set("sort", sort);
  const r = await fetch(`${BASE}/admin/users?${q}`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchUserDetail(id: string): Promise<{ user: User; sessions: DrivingSession[] }> {
  const r = await fetch(`${BASE}/admin/users/${id}`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
