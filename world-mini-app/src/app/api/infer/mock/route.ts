import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({
    face_detected: true, blink_detected: false, eyes_closed_score: 0.1, yawn_score: 0.2,
    drowsiness_score: 0.15, impairment_risk_score: 0.05, event_labels: [],
    disclaimer: "Experimental signals only — not medical or legal advice."
  });
}
