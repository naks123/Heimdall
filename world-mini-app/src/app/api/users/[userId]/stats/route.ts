import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export function calcSafetyScore(trip: any): number {
  const raw =
    100 -
    trip.drowsy_percent * 0.5 -
    trip.max_risk_score * 30 -
    trip.yawn_count * 0.5 -
    trip.prolonged_eye_closure_count * 1;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function getStatus(score: number): string {
  if (score >= 70) return "Safe";
  if (score >= 60) return "Attention";
  return "High Risk";
}

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = (await params).userId;
  const d = db.read();
  
  const userSessions = d.sessions.filter(s => s.user_id === userId);
  
  const lifetimeTimeSec = userSessions.reduce((acc, s) => acc + s.monitoring_duration_sec, 0);
  const lifetimeYawns = userSessions.reduce((acc, s) => acc + s.yawn_count, 0);
  const lifetimePec = userSessions.reduce((acc, s) => acc + s.prolonged_eye_closure_count, 0);

  let avgSafetyScore = 100;
  let peakRiskScore = 0;
  let avgDrowsyPercent = 0;
  let status = "Safe";

  if (userSessions.length > 0) {
    const totalScore = userSessions.reduce((acc, s) => acc + calcSafetyScore(s), 0);
    avgSafetyScore = Math.round(totalScore / userSessions.length);
    peakRiskScore = Math.max(...userSessions.map(s => s.max_risk_score));
    const totalDrowsy = userSessions.reduce((acc, s) => acc + s.drowsy_percent, 0);
    avgDrowsyPercent = Math.round(totalDrowsy / userSessions.length);
    status = getStatus(avgSafetyScore);
  }

  return NextResponse.json({
    sessionCount: userSessions.length,
    lifetimeTimeSec,
    lifetimeYawns,
    lifetimePec,
    avgSafetyScore,
    peakRiskScore,
    avgDrowsyPercent,
    status
  });
}
