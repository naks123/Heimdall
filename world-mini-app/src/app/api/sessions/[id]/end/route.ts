import { NextResponse } from "next/server";
import { db } from "@/lib/store";

function sessionRowToApi(r: any) {
  return {
    id: r.id, userId: r.user_id, startedAt: r.started_at, endedAt: r.ended_at, status: r.status,
    metrics: {
      totalDriveDurationSec: r.total_drive_duration_sec, monitoringDurationSec: r.monitoring_duration_sec,
      yawnCount: r.yawn_count, prolongedEyeClosureCount: r.prolonged_eye_closure_count,
      blinkCount: r.blink_count, drowsyPercent: r.drowsy_percent, maxRiskScore: r.max_risk_score,
      eventCounts: r.event_json ? JSON.parse(r.event_json) : undefined,
    }
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const endedAt = new Date().toISOString();
  db.write((store) => {
    const s = store.sessions.find((x) => x.id === id);
    if (!s) return;
    s.ended_at = endedAt; s.status = "ended";
    if (body) {
      s.total_drive_duration_sec = body.totalDriveDurationSec ?? 0;
      s.monitoring_duration_sec = body.monitoringDurationSec ?? 0;
      s.yawn_count = body.yawnCount ?? 0;
      s.prolonged_eye_closure_count = body.prolongedEyeClosureCount ?? 0;
      s.blink_count = body.blinkCount ?? 0;
      s.drowsy_percent = body.drowsyPercent ?? 0;
      s.max_risk_score = body.maxRiskScore ?? 0;
      s.event_json = body.eventCounts ? JSON.stringify(body.eventCounts) : null;
    }
  });
  const row = db.read().sessions.find((x) => x.id === id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(sessionRowToApi(row));
}
