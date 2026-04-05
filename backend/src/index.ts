import cors from "@fastify/cors";
import Fastify from "fastify";
import { randomUUID } from "crypto";
import { db } from "./store.js";
import type { SessionRow, UserRow } from "./store.js";
import type { SessionMetrics } from "./types.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const ADMIN_TOKEN = "demo-admin";
const DEMO_USER_HEADER = "X-User-Id";

function requireAdmin(headers: Record<string, string | string[] | undefined>) {
  const t = headers["x-admin-token"];
  const tok = Array.isArray(t) ? t[0] : t;
  if (tok !== ADMIN_TOKEN) {
    const err = new Error("Unauthorized");
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }
}

function rowToUser(r: UserRow) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    overallDrivingScore: r.overall_driving_score,
    createdAt: r.created_at,
  };
}

function sessionRowToApi(r: SessionRow) {
  const metrics: SessionMetrics = {
    totalDriveDurationSec: r.total_drive_duration_sec,
    monitoringDurationSec: r.monitoring_duration_sec,
    yawnCount: r.yawn_count,
    prolongedEyeClosureCount: r.prolonged_eye_closure_count,
    blinkCount: r.blink_count,
    drowsyPercent: r.drowsy_percent,
    maxRiskScore: r.max_risk_score,
    eventCounts: r.event_json ? JSON.parse(r.event_json) : undefined,
  };
  return {
    id: r.id,
    userId: r.user_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    status: r.status,
    metrics,
  };
}

app.get("/health", async () => ({ ok: true }));

app.post("/auth/demo", async () => {
  const d = db.read();
  const u = d.users.sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  if (!u) return { token: "demo", user: null };
  return { token: "demo-token", user: rowToUser(u) };
});

app.post("/sessions", async (req, reply) => {
  const body = req.body as { userId?: string; startedAt?: string };
  let userId = body.userId ?? (req.headers[DEMO_USER_HEADER.toLowerCase()] as string) ?? "";
  const d = db.read();
  if (!userId) {
    const first = d.users[0];
    if (!first) return reply.code(400).send({ error: "No users — run npm run seed" });
    userId = first.id;
  }
  const id = randomUUID();
  const startedAt = body.startedAt ?? new Date().toISOString();
  db.write((store) => {
    store.sessions.push({
      id,
      user_id: userId,
      started_at: startedAt,
      ended_at: null,
      status: "active",
      total_drive_duration_sec: 0,
      monitoring_duration_sec: 0,
      yawn_count: 0,
      prolonged_eye_closure_count: 0,
      blink_count: 0,
      drowsy_percent: 0,
      max_risk_score: 0,
      event_json: null,
    });
  });
  return { id, userId, startedAt, status: "active" };
});

app.patch("/sessions/:id/end", async (req) => {
  const { id } = req.params as { id: string };
  const body = req.body as SessionMetrics | undefined;
  const endedAt = new Date().toISOString();
  db.write((store) => {
    const s = store.sessions.find((x) => x.id === id);
    if (!s) return;
    s.ended_at = endedAt;
    s.status = "ended";
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
  const row = db.read().sessions.find((x) => x.id === id)!;
  return sessionRowToApi(row);
});

app.get("/users/:userId/sessions", async (req) => {
  const { userId } = req.params as { userId: string };
  const rows = db
    .read()
    .sessions.filter((s) => s.user_id === userId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  return rows.map(sessionRowToApi);
});

app.get("/users/:userId/insights", async (req) => {
  const { userId } = req.params as { userId: string };
  const rows = db
    .read()
    .sessions.filter((s) => s.user_id === userId && s.status === "ended")
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 20);
  if (rows.length < 2) {
    return { enoughData: false, message: "Need more sessions" };
  }
  const avgMon = rows.reduce((a, r) => a + r.monitoring_duration_sec, 0) / rows.length;
  const fatigueMinute = Math.round((avgMon / 60) * 0.35);
  return {
    enoughData: true,
    message: `Based on your recent sessions, fatigue signs often appear after about ${fatigueMinute} minutes of monitoring (experimental estimate).`,
    sessionCount: rows.length,
  };
});

app.get("/admin/users", async (req, reply) => {
  try {
    requireAdmin(req.headers as Record<string, string | string[] | undefined>);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const q = req.query as { search?: string; sort?: string };
  let users = [...db.read().users];
  if (q.search) {
    const s = q.search.toLowerCase();
    users = users.filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }
  const sessions = db.read().sessions;
  const maxStarted = (uid: string) =>
    Math.max(0, ...sessions.filter((x) => x.user_id === uid).map((x) => new Date(x.started_at).getTime()));
  const maxRisk = (uid: string) => Math.max(0, ...sessions.filter((x) => x.user_id === uid).map((x) => x.max_risk_score));

  switch (q.sort) {
    case "score_low":
      users.sort((a, b) => a.overall_driving_score - b.overall_driving_score);
      break;
    case "score_high":
      users.sort((a, b) => b.overall_driving_score - a.overall_driving_score);
      break;
    case "recent_session":
      users.sort((a, b) => maxStarted(b.id) - maxStarted(a.id));
      break;
    case "highest_risk":
      users.sort((a, b) => maxRisk(b.id) - maxRisk(a.id));
      break;
    default:
      users.sort((a, b) => a.name.localeCompare(b.name));
  }
  return users.map(rowToUser);
});

app.get("/admin/users/:id", async (req, reply) => {
  try {
    requireAdmin(req.headers as Record<string, string | string[] | undefined>);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const { id } = req.params as { id: string };
  const u = db.read().users.find((x) => x.id === id);
  if (!u) return reply.code(404).send({ error: "Not found" });
  const sess = db
    .read()
    .sessions.filter((s) => s.user_id === id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 50);
  return { user: rowToUser(u), sessions: sess.map(sessionRowToApi) };
});

app.post("/infer/mock", async () => ({
  face_detected: true,
  blink_detected: false,
  eyes_closed_score: 0.1,
  yawn_score: 0.2,
  drowsiness_score: 0.15,
  impairment_risk_score: 0.05,
  event_labels: [] as string[],
  disclaimer:
    "Experimental signals only — not medical or legal advice. Possible impairment risk is a rough heuristic.",
}));

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  console.log(`Backend http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
