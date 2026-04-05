export type SafetyStatus = "Safe" | "Attention" | "High Risk";

export interface ScoredTrip {
  drowsyPercent: number;
  maxRiskScore: number;
  yawnCount: number;
  prolongedEyeClosureCount: number;
}

export function calcSafetyScore(trip: ScoredTrip): number {
  const raw =
    100 -
    trip.drowsyPercent * 0.5 -
    trip.maxRiskScore * 30 -
    trip.yawnCount * 0.5 -
    trip.prolongedEyeClosureCount * 1;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function getStatus(score: number): SafetyStatus {
  if (score >= 70) return "Safe";
  if (score >= 60) return "Attention";
  return "High Risk";
}

/** CSS variable string for risk score cells (0–1 scale). */
export function getRiskColor(maxRiskScore: number): string {
  if (maxRiskScore < 0.5) return "var(--color-safe-text)";
  if (maxRiskScore <= 0.7) return "var(--color-warn-text)";
  return "var(--color-risk-text)";
}

/** CSS variable string for safety score display. */
export function getScoreColor(score: number): string {
  if (score >= 70) return "var(--color-safe-text)";
  if (score >= 60) return "var(--color-warn-text)";
  return "var(--color-risk-text)";
}
