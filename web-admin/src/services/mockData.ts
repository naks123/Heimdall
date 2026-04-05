// ─── Types ────────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
}

export interface Driver {
  id: string;
  name: string;
  memberSince: string; // ISO date
}

export interface Employment {
  driverId: string;
  companyId: string;
  startDate: string;  // ISO date
  endDate: string | null; // null = currently employed
}

export interface Trip {
  id: string;
  driverId: string;
  companyId: string;
  date: string; // ISO date
  origin: string;
  destination: string;
  totalDriveDurationSec: number;
  monitoringDurationSec: number;
  yawnCount: number;
  prolongedEyeClosureCount: number;
  drowsyPercent: number;    // 0–100
  maxRiskScore: number;     // 0–1
  modelVersion: string;
}

// ─── Static reference data ────────────────────────────────────────────────────

export const COMPANIES: Company[] = [
  { id: "amazon", name: "Amazon Logistics" },
  { id: "cta",    name: "Chicago Transit Authority" },
  { id: "fedex",  name: "FedEx Ground" },
];

export const DRIVERS: Driver[] = [
  { id: "quinn",   name: "Quinn Patel",       memberSince: "2025-01-15" },
  { id: "marcus",  name: "Marcus Chen",       memberSince: "2024-03-10" },
  { id: "sarah",   name: "Sarah Johnson",     memberSince: "2024-06-01" },
  { id: "david",   name: "David Kim",         memberSince: "2024-02-01" },
  { id: "priya",   name: "Priya Sharma",      memberSince: "2025-01-15" },
  { id: "jordan",  name: "Jordan Williams",   memberSince: "2024-01-15" },
  { id: "alex",    name: "Alex Torres",       memberSince: "2024-08-01" },
  { id: "natalie", name: "Natalie Brown",     memberSince: "2025-01-15" },
  { id: "tyler",   name: "Tyler Davis",       memberSince: "2024-09-01" },
  { id: "isabel",  name: "Isabel Martinez",   memberSince: "2023-11-01" },
];

export const EMPLOYMENT: Employment[] = [
  { driverId: "quinn",   companyId: "amazon", startDate: "2025-01-15", endDate: "2025-06-30" },
  { driverId: "quinn",   companyId: "fedex",  startDate: "2025-07-01", endDate: null },
  { driverId: "marcus",  companyId: "amazon", startDate: "2024-03-10", endDate: null },
  { driverId: "sarah",   companyId: "cta",    startDate: "2024-06-01", endDate: null },
  { driverId: "david",   companyId: "fedex",  startDate: "2024-02-01", endDate: null },
  { driverId: "priya",   companyId: "cta",    startDate: "2025-01-15", endDate: "2025-05-31" },
  { driverId: "priya",   companyId: "amazon", startDate: "2025-06-01", endDate: null },
  { driverId: "jordan",  companyId: "fedex",  startDate: "2024-01-15", endDate: null },
  { driverId: "alex",    companyId: "cta",    startDate: "2024-08-01", endDate: null },
  { driverId: "natalie", companyId: "amazon", startDate: "2025-01-15", endDate: "2025-04-30" },
  { driverId: "natalie", companyId: "cta",    startDate: "2025-05-01", endDate: null },
  { driverId: "tyler",   companyId: "fedex",  startDate: "2024-09-01", endDate: null },
  { driverId: "isabel",  companyId: "amazon", startDate: "2023-11-01", endDate: null },
];

// ─── Trip generation ──────────────────────────────────────────────────────────

const ROUTES: Record<string, [string, string][]> = {
  amazon: [
    ["O'Hare Distribution Center", "North Side Chicago"],
    ["Fulfillment Center",          "Evanston"],
    ["Warehouse A",                 "Hyde Park"],
    ["Sorting Hub",                 "Oak Park"],
    ["Distribution Center",         "Naperville"],
    ["Warehouse B",                 "Wicker Park"],
    ["Fulfillment Center",          "Rogers Park"],
  ],
  cta: [
    ["Forest Park",     "O'Hare Blue Line"],
    ["Howard",          "95th/Dan Ryan"],
    ["Linden",          "Loop"],
    ["Jefferson Park",  "Midway Airport"],
    ["O'Hare",          "UIC-Halsted"],
    ["Kimball",         "Ashland/63rd"],
    ["Belmont",         "Clark/Lake"],
  ],
  fedex: [
    ["FedEx Hub Hodgkins", "Downtown Chicago"],
    ["Sorting Center",     "Naperville"],
    ["Hub",                "Schaumburg"],
    ["Distribution Ctr",   "Aurora"],
    ["Hub",                "Joliet"],
    ["Sorting Facility",   "Elgin"],
    ["Hub",                "Bolingbrook"],
  ],
};

const DURATION_RANGES: Record<string, [number, number]> = {
  amazon: [2700,  7200],  // 45 min – 2 hr
  cta:    [5400, 14400],  // 1.5 hr – 4 hr
  fedex:  [7200, 21600],  // 2 hr – 6 hr
};

// Deterministic xorshift32
class SeededRandom {
  private s: number;
  constructor(seed: number) { this.s = (seed * 1664525 + 1013904223) >>> 0; }
  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >> 17;
    this.s ^= this.s << 5;
    this.s = this.s >>> 0;
    return this.s / 4294967295;
  }
  range(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
  int(lo: number, hi: number): number { return Math.round(this.range(lo, hi)); }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

interface MetricRange { low: number; high: number }
interface ProfileRanges {
  drowsy: MetricRange;
  risk:   MetricRange;
  yawn:   MetricRange;
  pec:    MetricRange;
}

const METRIC_PROFILES: Record<string, ProfileRanges> = {
  safe: {
    drowsy: { low: 6,  high: 18   },
    risk:   { low: 0.10, high: 0.32 },
    yawn:   { low: 1,  high: 4    },
    pec:    { low: 0,  high: 2    },
  },
  attention: {
    drowsy: { low: 22, high: 40   },
    risk:   { low: 0.45, high: 0.65 },
    yawn:   { low: 4,  high: 9    },
    pec:    { low: 2,  high: 5    },
  },
  "high-risk": {
    drowsy: { low: 42, high: 62   },
    risk:   { low: 0.68, high: 0.88 },
    yawn:   { low: 8,  high: 16   },
    pec:    { low: 5,  high: 12   },
  },
};

function blendProfile(a: ProfileRanges, b: ProfileRanges, t: number): ProfileRanges {
  const bl = (x: number, y: number) => lerp(x, y, t);
  return {
    drowsy: { low: bl(a.drowsy.low, b.drowsy.low), high: bl(a.drowsy.high, b.drowsy.high) },
    risk:   { low: bl(a.risk.low,   b.risk.low),   high: bl(a.risk.high,   b.risk.high)   },
    yawn:   { low: bl(a.yawn.low,   b.yawn.low),   high: bl(a.yawn.high,   b.yawn.high)   },
    pec:    { low: bl(a.pec.low,    b.pec.low),    high: bl(a.pec.high,    b.pec.high)    },
  };
}

type TrendType = "safe" | "attention" | "high-risk" | "improving" | "declining";

function resolveProfile(progress: number, trend: TrendType): ProfileRanges {
  switch (trend) {
    case "improving":
      return blendProfile(METRIC_PROFILES.attention, METRIC_PROFILES.safe, progress);
    case "declining":
      return blendProfile(METRIC_PROFILES.safe, METRIC_PROFILES["high-risk"], progress);
    default:
      return METRIC_PROFILES[trend];
  }
}

function generateTrips(
  rng: SeededRandom,
  driverId: string,
  companyId: string,
  startDate: string,
  endDate: string,
  count: number,
  trend: TrendType,
): Trip[] {
  const routes = ROUTES[companyId];
  const [durLo, durHi] = DURATION_RANGES[companyId];
  const startMs = new Date(startDate).getTime();
  const endMs   = new Date(endDate).getTime();
  const span    = endMs - startMs;
  const MODEL_CUTOFF = new Date("2025-10-01").getTime();

  const trips: Trip[] = [];

  for (let i = 0; i < count; i++) {
    const progress = count > 1 ? i / (count - 1) : 0.5;
    const centerMs = startMs + span * progress;
    const jitter   = (rng.next() - 0.5) * span * (0.7 / count);
    const tripMs   = Math.max(startMs, Math.min(endMs, centerMs + jitter));

    const dateStr      = new Date(tripMs).toISOString().split("T")[0];
    const modelVersion = tripMs >= MODEL_CUTOFF ? "v2.1.0" : "v2.0.0";
    const route        = routes[i % routes.length];
    const totalSec     = Math.round(rng.range(durLo, durHi));
    const monSec       = Math.round(totalSec * rng.range(0.75, 0.97));
    const p            = resolveProfile(progress, trend);

    trips.push({
      id: `${driverId}-${companyId}-${i}`,
      driverId,
      companyId,
      date:        dateStr,
      origin:      route[0],
      destination: route[1],
      totalDriveDurationSec:    totalSec,
      monitoringDurationSec:    monSec,
      yawnCount:                rng.int(p.yawn.low,   p.yawn.high),
      prolongedEyeClosureCount: rng.int(p.pec.low,    p.pec.high),
      drowsyPercent:            Math.round(rng.range(p.drowsy.low, p.drowsy.high)),
      maxRiskScore:             parseFloat(rng.range(p.risk.low, p.risk.high).toFixed(2)),
      modelVersion,
    });
  }

  return trips.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Generated trips ──────────────────────────────────────────────────────────

export const TRIPS: Trip[] = [
  // Quinn Patel — improving at Amazon, then consistently safe at FedEx
  ...generateTrips(new SeededRandom(1),  "quinn",   "amazon", "2025-01-15", "2025-06-30", 12, "improving"),
  ...generateTrips(new SeededRandom(2),  "quinn",   "fedex",  "2025-07-01", "2026-04-04", 14, "safe"),

  // Marcus Chen — consistently safe (Amazon)
  ...generateTrips(new SeededRandom(3),  "marcus",  "amazon", "2024-03-10", "2026-04-04", 25, "safe"),

  // Sarah Johnson — borderline / attention (CTA)
  ...generateTrips(new SeededRandom(4),  "sarah",   "cta",    "2024-06-01", "2026-04-04", 25, "attention"),

  // David Kim — improving: started high-risk, now safe (FedEx)
  ...generateTrips(new SeededRandom(5),  "david",   "fedex",  "2024-02-01", "2026-04-04", 25, "improving"),

  // Priya Sharma — consistently safe across two employers
  ...generateTrips(new SeededRandom(6),  "priya",   "cta",    "2025-01-15", "2025-05-31", 10, "safe"),
  ...generateTrips(new SeededRandom(7),  "priya",   "amazon", "2025-06-01", "2026-04-04", 14, "safe"),

  // Jordan Williams — declining: was safe, now high-risk (FedEx)
  ...generateTrips(new SeededRandom(8),  "jordan",  "fedex",  "2024-01-15", "2026-04-04", 25, "declining"),

  // Alex Torres — consistently safe (CTA)
  ...generateTrips(new SeededRandom(9),  "alex",    "cta",    "2024-08-01", "2026-04-04", 22, "safe"),

  // Natalie Brown — attention range across two employers
  ...generateTrips(new SeededRandom(10), "natalie", "amazon", "2025-01-15", "2025-04-30",  8, "attention"),
  ...generateTrips(new SeededRandom(11), "natalie", "cta",    "2025-05-01", "2026-04-04", 16, "attention"),

  // Tyler Davis — persistent high-risk (FedEx)
  ...generateTrips(new SeededRandom(12), "tyler",   "fedex",  "2024-09-01", "2026-04-04", 22, "high-risk"),

  // Isabel Martinez — veteran, excellent record (Amazon)
  ...generateTrips(new SeededRandom(13), "isabel",  "amazon", "2023-11-01", "2026-04-04", 30, "safe"),
];
