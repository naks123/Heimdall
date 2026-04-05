import { NextResponse } from "next/server";
import { db } from "@/lib/store";

function calcSafetyScore(trip: any): number {
  const raw = 100 - trip.drowsy_percent * 0.5 - trip.max_risk_score * 30 - trip.yawn_count * 0.5 - trip.prolonged_eye_closure_count * 1;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function getStatus(score: number): string {
  if (score >= 70) return "Safe";
  if (score >= 60) return "Attention";
  return "High Risk";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('companyId') || 'heimdall_internal';

  const d = db.read();
  
  // Automatically pull all crypto-verified users as "employees" of this dashboard view for this demo
  const summaries = d.users.map(u => {
    const userSessions = d.sessions.filter(s => s.user_id === u.id);
    const sessionsCount = userSessions.length;
    let avgDrowsyPercent = 0;
    let peakRiskScore = 0;
    let avgSafetyScore = 100;
    let status = "Safe";
    let lastTripDate = null;

    if (sessionsCount > 0) {
      avgDrowsyPercent = Math.round(userSessions.reduce((sum, s) => sum + s.drowsy_percent, 0) / sessionsCount);
      peakRiskScore = Math.max(...userSessions.map(s => s.max_risk_score));
      avgSafetyScore = Math.round(userSessions.reduce((sum, s) => sum + calcSafetyScore(s), 0) / sessionsCount);
      status = getStatus(avgSafetyScore);
      
      const sorted = [...userSessions].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
      lastTripDate = sorted[sorted.length - 1].started_at;
    }

    return {
      driver: { id: u.id, name: u.name, email: u.email, memberSince: u.created_at },
      employment: { id: `emp_${u.id}`, driverId: u.id, companyId, startDate: u.created_at, endDate: null },
      sessions: sessionsCount,
      lastTripDate,
      avgDrowsyPercent,
      peakRiskScore,
      avgSafetyScore,
      status
    };
  });

  return NextResponse.json(summaries);
}
