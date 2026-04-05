import { randomUUID } from "crypto";
import { db } from "./store.js";

const firstNames = [
  "Alex",
  "Jordan",
  "Sam",
  "Riley",
  "Casey",
  "Morgan",
  "Quinn",
  "Avery",
  "Taylor",
  "Jamie",
];
const lastNames = ["Kim", "Patel", "Nguyen", "Garcia", "Chen", "Brown", "Singh", "Lee", "Ali", "Fox"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function isoMinutesAgo(m: number): string {
  return new Date(Date.now() - m * 60 * 1000).toISOString();
}

export function seedDatabase() {
  db.write((d) => {
    d.users = [];
    d.sessions = [];

    for (let i = 0; i < 10; i++) {
      const id = randomUUID();
      const name = `${pick(firstNames)} ${pick(lastNames)}`;
      const score = 0.45 + Math.random() * 0.5;
      d.users.push({
        id,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@demo.local`,
        overall_driving_score: Math.round(score * 1000) / 1000,
        created_at: isoMinutesAgo(60 * 24 * (30 - i)),
      });

      const sessionCount = 3 + Math.floor(Math.random() * 5);
      for (let s = 0; s < sessionCount; s++) {
        const sid = randomUUID();
        const driveSec = 600 + Math.floor(Math.random() * 3600);
        const monSec = Math.floor(driveSec * (0.7 + Math.random() * 0.25));
        const yawns = Math.floor(Math.random() * 8);
        const pec = Math.floor(Math.random() * 5);
        const drowsy = Math.random() * 35;
        const maxRisk = 0.2 + Math.random() * 0.75;
        const started = isoMinutesAgo(200 * s + i * 17 + 5);
        const ended = isoMinutesAgo(200 * s + i * 17);
        d.sessions.push({
          id: sid,
          user_id: id,
          started_at: started,
          ended_at: ended,
          status: "ended",
          total_drive_duration_sec: driveSec,
          monitoring_duration_sec: monSec,
          yawn_count: yawns,
          prolonged_eye_closure_count: pec,
          blink_count: yawns * 3 + pec * 2,
          drowsy_percent: Math.round(drowsy * 10) / 10,
          max_risk_score: Math.round(maxRisk * 1000) / 1000,
          event_json: JSON.stringify({ yawn: yawns, prolonged_eye_closure: pec, microsleep_like: pec > 0 ? 1 : 0 }),
        });
      }
    }
  });

  console.log("Seeded 10 users with multiple sessions each → data/store.json");
}

seedDatabase();
