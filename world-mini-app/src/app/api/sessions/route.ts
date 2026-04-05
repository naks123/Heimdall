import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { randomUUID } from "crypto";
export async function POST(req: Request) {
  const body = await req.json();
  const userIdHeader = req.headers.get("x-user-id") ?? "";
  let userId = body.userId ?? userIdHeader;
  const d = db.read();
  if (!userId) {
    const first = d.users[0];
    if (!first) return NextResponse.json({ error: "No users" }, { status: 400 });
    userId = first.id;
  }
  const id = randomUUID();
  const startedAt = body.startedAt ?? new Date().toISOString();
  db.write((store) => {
    store.sessions.push({
      id, user_id: userId, started_at: startedAt, ended_at: null, status: "active",
      total_drive_duration_sec: 0, monitoring_duration_sec: 0, yawn_count: 0,
      prolonged_eye_closure_count: 0, blink_count: 0, drowsy_percent: 0, max_risk_score: 0, event_json: null,
    });
  });
  return NextResponse.json({ id, userId, startedAt, status: "active" });
}
