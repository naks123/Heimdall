import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = (await params).userId;
  const d = db.read();
  const user = d.users.find((u) => u.id === userId);
  
  if (!user) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json(user);
}

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = (await params).userId;
  const body = await req.json();
  
  db.write((d) => {
    const existing = d.users.find((u) => u.id === userId);
    if (existing) {
      existing.name = body.name || existing.name;
    } else {
      d.users.push({
        id: userId,
        name: body.name || "Anonymous Driver",
        email: "world_id@heimdall.local",
        overall_driving_score: 100,
        created_at: new Date().toISOString()
      });
    }
  });

  return NextResponse.json({ success: true });
}
