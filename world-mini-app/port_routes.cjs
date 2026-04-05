const fs = require('fs');
const path = require('path');

const write = (fpath, content) => {
  const full = path.join('/Users/alanh/Heimdall/world-mini-app', fpath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n');
};

write('src/lib/types.ts', `
export type DrivingSessionStatus = "active" | "ended";
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
`);

write('src/lib/store.ts', `
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

export interface UserRow {
  id: string; name: string; email: string; overall_driving_score: number; created_at: string;
}
export interface SessionRow {
  id: string; user_id: string; started_at: string; ended_at: string | null; status: string;
  total_drive_duration_sec: number; monitoring_duration_sec: number; yawn_count: number;
  prolonged_eye_closure_count: number; blink_count: number; drowsy_percent: number;
  max_risk_score: number; event_json: string | null;
}
interface DbFile { users: UserRow[]; sessions: SessionRow[]; }

const defaultPath = () => process.env.DATABASE_PATH ?? resolve(process.cwd(), "data/store.json");

function load(): DbFile {
  const path = defaultPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(path)) {
    const empty: DbFile = { users: [], sessions: [] };
    writeFileSync(path, JSON.stringify(empty, null, 2), "utf-8");
    return empty;
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function save(db: DbFile) {
  writeFileSync(defaultPath(), JSON.stringify(db, null, 2), "utf-8");
}

export const db = {
  read(): DbFile { return load(); },
  write(fn: (d: DbFile) => void) {
    const d = load();
    fn(d);
    save(d);
  },
};
`);

write('src/app/api/health/route.ts', `
import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ ok: true }); }
`);

write('src/app/api/auth/demo/route.ts', `
import { NextResponse } from "next/server";
import { db } from "@/lib/store";
function rowToUser(r: any) {
  return { id: r.id, name: r.name, email: r.email, overallDrivingScore: r.overall_driving_score, createdAt: r.created_at };
}
export async function POST() {
  const d = db.read();
  const u = d.users.sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  if (!u) return NextResponse.json({ token: "demo", user: null });
  return NextResponse.json({ token: "demo-token", user: rowToUser(u) });
}
`);

write('src/app/api/sessions/route.ts', `
import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { randomUUID } from "process";
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
`);

write('src/app/api/sessions/[id]/end/route.ts', `
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
`);

write('src/app/api/infer/mock/route.ts', `
import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({
    face_detected: true, blink_detected: false, eyes_closed_score: 0.1, yawn_score: 0.2,
    drowsiness_score: 0.15, impairment_risk_score: 0.05, event_labels: [],
    disclaimer: "Experimental signals only — not medical or legal advice."
  });
}
`);
