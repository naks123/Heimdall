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

export interface DrivingSessionRow {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  status: DrivingSessionStatus;
  metrics: SessionMetrics | null;
}
