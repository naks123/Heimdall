import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = (await params).userId;
  const d = db.read();
  
  // Filter for sessions matching this cryptographic World ID
  const userSessions = d.sessions.filter(s => s.user_id === userId);
  
  const lifetimeTimeSec = userSessions.reduce((acc, s) => acc + s.monitoring_duration_sec, 0);
  const lifetimeYawns = userSessions.reduce((acc, s) => acc + s.yawn_count, 0);
  const lifetimePec = userSessions.reduce((acc, s) => acc + s.prolonged_eye_closure_count, 0);

  return NextResponse.json({
    sessionCount: userSessions.length,
    lifetimeTimeSec,
    lifetimeYawns,
    lifetimePec
  });
}
