import { NextResponse } from "next/server";
import { db } from "@/lib/store";

function calcSafetyScoreUI(trip: any): number {
  const raw = 100 - trip.drowsyPercent * 0.5 - trip.maxRiskScore * 30 - trip.yawnCount * 0.5 - trip.prolongedEyeClosureCount * 1;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function calcMonthlyTrend(trips: any[]) {
    const points: any[] = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today);
      d.setMonth(today.getMonth() - i);
      const yr = d.getFullYear();
      const mo = d.getMonth();
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const monthTrips = trips.filter(t => {
        const td = new Date(t.date);
        return td.getFullYear() === yr && td.getMonth() === mo;
      });
      points.push({
        month: label,
        avgScore: monthTrips.length > 0
          ? Math.round(monthTrips.reduce((sum, t) => sum + calcSafetyScoreUI(t), 0) / monthTrips.length)
          : 0,
      });
    }
    return points;
}

export async function GET(req: Request, { params }: { params: Promise<{ driverId: string }> }) {
  const driverId = (await params).driverId;
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('viewerCompanyId') || 'heimdall_internal';
  
  const d = db.read();
  const u = d.users.find(x => x.id === driverId);
  if (!u) return new NextResponse("Not Found", { status: 404 });

  const userSessions = d.sessions.filter(s => s.user_id === driverId);
  
  // Format to match web-admin's 'Trip' object exactly
  const trips = userSessions.map(s => {
      return {
          id: s.id,
          driverId: s.user_id,
          companyId,
          date: s.started_at,
          origin: "Distribution Hub",
          destination: "Active Route",
          totalDriveDurationSec: s.total_drive_duration_sec,
          monitoringDurationSec: s.monitoring_duration_sec,
          drowsyPercent: s.drowsy_percent,
          maxRiskScore: s.max_risk_score,
          yawnCount: s.yawn_count,
          prolongedEyeClosureCount: s.prolonged_eye_closure_count,
          modelVersion: "v3.0.1"
      };
  });

  const avgSafetyScore = trips.length > 0 ? Math.round(trips.reduce((acc, t) => acc + calcSafetyScoreUI(t), 0) / trips.length) : 100;
  
  const profileData = {
      driver: { id: u.id, name: u.name, email: u.email, memberSince: u.created_at },
      employments: [{ id: `emp_${u.id}`, driverId: u.id, companyId, startDate: u.created_at, endDate: null }],
      trips,
      viewerEmployment: { id: `emp_${u.id}`, driverId: u.id, companyId, startDate: u.created_at, endDate: null },
      stats: {
          totalSessions: trips.length,
          avgDrowsyPercent: trips.length > 0 ? Math.round(trips.reduce((a, b) => a + b.drowsyPercent, 0) / trips.length) : 0,
          peakRiskScore: trips.length > 0 ? Math.max(...trips.map(t => t.maxRiskScore)) : 0,
          avgSafetyScore,
          scoreTrend90: 0
      },
      monthlyTrend: calcMonthlyTrend(trips)
  };

  return NextResponse.json(profileData);
}
