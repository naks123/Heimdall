import type { DrivingSession } from "./api";

/** Seconds for a session: prefer stored metrics, else ended − started. */
export function getSessionDurationSec(session: DrivingSession): number {
  const fromMetrics = session.metrics?.totalDriveDurationSec;
  if (fromMetrics != null && fromMetrics > 0) return fromMetrics;
  if (session.endedAt && session.startedAt) {
    const a = new Date(session.startedAt).getTime();
    const b = new Date(session.endedAt).getTime();
    const d = Math.round((b - a) / 1000);
    if (d > 0) return d;
  }
  return 0;
}

/** e.g. "30 min", "4h 12m", "45 sec" */
export function formatDurationHuman(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return "—";
  const s = Math.floor(totalSec);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) {
    if (remSec === 0) return `${m} min`;
    return `${m} min ${remSec} sec`;
  }
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  if (remMin === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${remMin}m`;
}
