import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

export interface UserRow {
  id: string; name: string; email: string; company?: string; overall_driving_score: number; created_at: string;
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
