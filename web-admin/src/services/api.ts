import { COMPANIES, DRIVERS, EMPLOYMENT, TRIPS, type Company, type Driver, type Employment, type Trip } from "./mockData";
import { calcSafetyScore, getStatus, type SafetyStatus } from "./scoring";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateFilter = "week" | "month" | "3months" | "all";

export interface CompanyDriverSummary {
  driver: Driver;
  employment: Employment;
  sessions: number;
  lastTripDate: string | null;
  avgDrowsyPercent: number;
  peakRiskScore: number;
  avgSafetyScore: number;
  status: SafetyStatus;
}

export interface MonthlyPoint {
  month: string;   // e.g. "Oct '25"
  avgScore: number;
}

export interface DriverProfileData {
  driver: Driver;
  employments: Employment[];
  trips: Trip[];
  viewerEmployment: Employment | null;
  stats: {
    totalSessions: number;
    avgDrowsyPercent: number;
    peakRiskScore: number;
    avgSafetyScore: number;
    scoreTrend90: number; // positive = improving
  };
  monthlyTrend: MonthlyPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = "2026-04-04";

function dateOffset(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export function filterByDate(trips: Trip[], filter: DateFilter): Trip[] {
  switch (filter) {
    case "week":    return trips.filter(t => t.date >= dateOffset(7));
    case "month":   return trips.filter(t => t.date >= dateOffset(30));
    case "3months": return trips.filter(t => t.date >= dateOffset(90));
    default:        return trips;
  }
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function calcTrend90(trips: Trip[]): number {
  const cutoff90  = dateOffset(90);
  const cutoff180 = dateOffset(180);
  const recent = trips.filter(t => t.date >= cutoff90);
  const prior  = trips.filter(t => t.date >= cutoff180 && t.date < cutoff90);
  if (recent.length === 0 || prior.length === 0) return 0;
  const recentAvg = avg(recent.map(t => calcSafetyScore(t)));
  const priorAvg  = avg(prior.map(t => calcSafetyScore(t)));
  return Math.round(recentAvg - priorAvg);
}

function calcMonthlyTrend(trips: Trip[]): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  const today = new Date(TODAY);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today);
    d.setMonth(today.getMonth() - i);
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const monthTrips = trips.filter(t => {
      const td = new Date(t.date);
      return td.getFullYear() === yr && td.getMonth() === mo;
    });
    points.push({
      month: label,
      avgScore: monthTrips.length > 0
        ? Math.round(avg(monthTrips.map(t => calcSafetyScore(t))))
        : 0,
    });
  }
  return points;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getCompany(companyId: string): Company | undefined {
  return COMPANIES.find(c => c.id === companyId);
}

export function getDriver(driverId: string): Driver | undefined {
  return DRIVERS.find(d => d.id === driverId);
}

export function getDriversForCompany(
  companyId: string,
  dateFilter: DateFilter,
): CompanyDriverSummary[] {
  const employments = EMPLOYMENT.filter(e => e.companyId === companyId);

  return employments.map(emp => {
    const driver = DRIVERS.find(d => d.id === emp.driverId)!;
    const endDate = emp.endDate ?? TODAY;

    // Trips scoped to this company AND employment window
    let trips = TRIPS.filter(
      t =>
        t.driverId === emp.driverId &&
        t.companyId === companyId &&
        t.date >= emp.startDate &&
        t.date <= endDate,
    );
    trips = filterByDate(trips, dateFilter);

    if (trips.length === 0) {
      return {
        driver, employment: emp,
        sessions: 0, lastTripDate: null,
        avgDrowsyPercent: 0, peakRiskScore: 0,
        avgSafetyScore: 100, status: "Safe" as SafetyStatus,
      };
    }

    const scores = trips.map(t => calcSafetyScore(t));
    const avgScore = Math.round(avg(scores));

    return {
      driver,
      employment: emp,
      sessions:          trips.length,
      lastTripDate:      trips[trips.length - 1].date,
      avgDrowsyPercent:  Math.round(avg(trips.map(t => t.drowsyPercent))),
      peakRiskScore:     Math.max(...trips.map(t => t.maxRiskScore)),
      avgSafetyScore:    avgScore,
      status:            getStatus(avgScore),
    };
  });
}

export function getDriverProfile(
  driverId: string,
  viewerCompanyId?: string,
): DriverProfileData | null {
  const driver = DRIVERS.find(d => d.id === driverId);
  if (!driver) return null;

  const employments = EMPLOYMENT.filter(e => e.driverId === driverId);

  // If a company is viewing, scope trips to their employment window
  let trips: Trip[];
  let viewerEmployment: Employment | null = null;

  if (viewerCompanyId) {
    viewerEmployment = employments.find(e => e.companyId === viewerCompanyId) ?? null;
    if (viewerEmployment) {
      const endDate = viewerEmployment.endDate ?? TODAY;
      trips = TRIPS.filter(
        t =>
          t.driverId === driverId &&
          t.companyId === viewerCompanyId &&
          t.date >= viewerEmployment!.startDate &&
          t.date <= endDate,
      );
    } else {
      trips = [];
    }
  } else {
    // Driver or public: all trips
    trips = TRIPS.filter(t => t.driverId === driverId);
  }

  const scores = trips.map(t => calcSafetyScore(t));
  const avgScore = scores.length > 0 ? Math.round(avg(scores)) : 100;

  return {
    driver,
    employments,
    trips,
    viewerEmployment,
    stats: {
      totalSessions:    trips.length,
      avgDrowsyPercent: trips.length > 0 ? Math.round(avg(trips.map(t => t.drowsyPercent))) : 0,
      peakRiskScore:    trips.length > 0 ? Math.max(...trips.map(t => t.maxRiskScore)) : 0,
      avgSafetyScore:   avgScore,
      scoreTrend90:     calcTrend90(trips),
    },
    monthlyTrend: calcMonthlyTrend(trips),
  };
}

// ─── Share token stubs (backend team to implement) ────────────────────────────
// Required backend endpoints:
//   POST   /api/share-tokens         → { token, url, expiresAt }
//   DELETE /api/share-tokens/:token  → 204
//   GET    /api/profile/:token       → DriverProfileData (no auth required)

export function createShareToken(driverId: string): { token: string; url: string } {
  const token = `ht_${driverId}_${Date.now().toString(36)}`;
  return { token, url: `${window.location.origin}/profile/${token}` };
}

export function revokeShareToken(_token: string): void {
  // STUB — backend to implement DELETE /api/share-tokens/:token
}

/** Extracts driverId from a mock share token (ht_{driverId}_{ts}). */
export function getDriverIdFromToken(token: string): string | null {
  const m = token.match(/^ht_([a-z]+)_/);
  return m ? m[1] : null;
}
