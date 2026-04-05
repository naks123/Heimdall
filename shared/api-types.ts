/**
 * Shared API contracts between backend, web-admin, and mobile (mirror in JS if needed).
 */

export type DrivingSessionStatus = "active" | "ended";

export interface User {
  id: string;
  name: string;
  email: string;
  overallDrivingScore: number;
  createdAt: string;
}

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

export interface DrivingSession {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  status: DrivingSessionStatus;
  metrics: SessionMetrics | null;
}

export interface InferenceFrameResult {
  face_detected: boolean;
  blink_detected: boolean;
  eyes_closed_score: number;
  yawn_score: number;
  drowsiness_score: number;
  /** Experimental heuristic only — not a medical or legal assessment. */
  impairment_risk_score: number;
  event_labels: string[];
}

export interface AdminUserListQuery {
  search?: string;
  sort?: "score_high" | "score_low" | "recent_session" | "highest_risk";
}
