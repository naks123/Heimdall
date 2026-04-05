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
