import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../services/auth";
import {
  getCompany,
  getDriversForCompany,
  type CompanyDriverSummary,
  type DateFilter,
} from "../services/api";
import { getRiskColor } from "../services/scoring";
import StatusBadge from "../components/StatusBadge";
import ScoreBar from "../components/ScoreBar";

type SortKey =
  | "risk_asc"
  | "risk_desc"
  | "drowsy_desc"
  | "peak_desc"
  | "sessions_desc"
  | "name_asc"
  | "recent_desc";

type StatusFilter = "all" | "Safe" | "Attention" | "High Risk";

const DATE_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: "This Week",     value: "week"    },
  { label: "This Month",    value: "month"   },
  { label: "Last 3 Months", value: "3months" },
  { label: "All Time",      value: "all"     },
];

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Most at-risk first", value: "risk_asc"      },
  { label: "Safest first",       value: "risk_desc"     },
  { label: "Highest drowsy %",   value: "drowsy_desc"   },
  { label: "Highest peak risk",  value: "peak_desc"     },
  { label: "Most sessions",      value: "sessions_desc" },
  { label: "Name A–Z",           value: "name_asc"      },
  { label: "Most recent session",value: "recent_desc"   },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const controlSel: React.CSSProperties = {
  background:  "var(--color-surface)",
  color:       "var(--color-text-primary)",
  border:      "1px solid var(--color-border-2)",
  borderRadius:"4px",
  padding:     "6px 10px",
  fontSize:    "13px",
  fontFamily:  "Syne, sans-serif",
  outline:     "none",
};

const controlInput: React.CSSProperties = {
  ...controlSel,
  minWidth: "200px",
};

const thStyle: React.CSSProperties = {
  padding:       "10px 14px",
  textAlign:     "left",
  fontSize:      "11px",
  fontWeight:    500,
  letterSpacing: "0.06em",
  color:         "var(--color-text-muted)",
  borderBottom:  "1px solid var(--color-border)",
  whiteSpace:    "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding:      "12px 14px",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace:   "nowrap",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FleetDashboard() {
  const { auth } = useAuth();
  const companyId = auth.companyId!;
  const company = getCompany(companyId);

  const [dateFilter,    setDateFilter]    = useState<DateFilter>("month");
  const [sortKey,       setSortKey]       = useState<SortKey>("risk_asc");
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("all");
  const [search,        setSearch]        = useState("");

  const allSummaries = useMemo(
    () => getDriversForCompany(companyId, dateFilter),
    [companyId, dateFilter],
  );

  const latestModel = useMemo(() => {
    const versions = allSummaries
      .flatMap(s => s.sessions > 0 ? [] : [])
      .filter(Boolean);
    return versions.length > 0 ? versions[0] : "v2.1.0";
  }, [allSummaries]);

  // Stats cards
  const activeSummaries = allSummaries.filter(s => s.sessions > 0);
  const totalDrivers    = activeSummaries.length;
  const avgScore        = activeSummaries.length > 0
    ? Math.round(activeSummaries.reduce((a, s) => a + s.avgSafetyScore, 0) / activeSummaries.length)
    : 0;
  const highRiskCount   = activeSummaries.filter(s => s.status === "High Risk").length;
  const totalSessions   = allSummaries.reduce((a, s) => a + s.sessions, 0);

  // Filtering + sorting
  const displayed: CompanyDriverSummary[] = useMemo(() => {
    let rows = [...allSummaries];

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(s => s.driver.name.toLowerCase().includes(q));
    }

    if (statusFilter !== "all") {
      rows = rows.filter(s => s.status === statusFilter);
    }

    rows.sort((a, b) => {
      switch (sortKey) {
        case "risk_asc":      return a.avgSafetyScore - b.avgSafetyScore;
        case "risk_desc":     return b.avgSafetyScore - a.avgSafetyScore;
        case "drowsy_desc":   return b.avgDrowsyPercent - a.avgDrowsyPercent;
        case "peak_desc":     return b.peakRiskScore - a.peakRiskScore;
        case "sessions_desc": return b.sessions - a.sessions;
        case "name_asc":      return a.driver.name.localeCompare(b.driver.name);
        case "recent_desc": {
          const da = a.lastTripDate ?? "";
          const db = b.lastTripDate ?? "";
          return db.localeCompare(da);
        }
      }
    });

    return rows;
  }, [allSummaries, search, statusFilter, sortKey]);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px 64px" }}>

      {/* Page title */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)" }}>
          Fleet Dashboard
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--color-text-muted)" }}>
          {company?.name} — driver safety overview
        </p>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap:                 "14px",
          marginBottom:        "28px",
        }}
      >
        <StatCard label="Active Drivers" value={String(totalDrivers)} />
        <StatCard label="Fleet Avg Score" value={String(avgScore)} mono />
        <StatCard
          label="High Risk Drivers"
          value={String(highRiskCount)}
          valueColor={highRiskCount > 0 ? "var(--color-risk-text)" : undefined}
        />
        <StatCard label="Sessions" value={String(totalSessions)} mono />
      </div>

      {/* Controls */}
      <div
        style={{
          display:      "flex",
          flexWrap:     "wrap",
          gap:          "10px",
          marginBottom: "20px",
          alignItems:   "center",
        }}
      >
        <input
          style={controlInput}
          placeholder="Search driver…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={controlSel} value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select style={controlSel} value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">All statuses</option>
          <option value="Safe">Safe</option>
          <option value="Attention">Attention</option>
          <option value="High Risk">High Risk</option>
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: "1px" }}>
          {DATE_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setDateFilter(o.value)}
              style={{
                padding:    "6px 12px",
                fontSize:   "12px",
                fontFamily: "Syne, sans-serif",
                cursor:     "pointer",
                border:     "1px solid var(--color-border-2)",
                background: dateFilter === o.value ? "var(--color-surface-2)" : "var(--color-surface)",
                color:      dateFilter === o.value ? "var(--color-text-primary)" : "var(--color-text-muted)",
                borderRadius: 0,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          border:       "1px solid var(--color-border)",
          borderRadius: "6px",
          overflow:     "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead style={{ background: "var(--color-surface)" }}>
            <tr>
              <th style={thStyle}>DRIVER</th>
              <th style={{ ...thStyle, textAlign: "right" }}>SESSIONS</th>
              <th style={thStyle}>LAST TRIP</th>
              <th style={{ ...thStyle, textAlign: "right" }}>AVG DROWSY</th>
              <th style={{ ...thStyle, textAlign: "right" }}>PEAK RISK</th>
              <th style={thStyle}>SAFETY SCORE</th>
              <th style={thStyle}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    ...tdStyle,
                    color:     "var(--color-text-muted)",
                    textAlign: "center",
                    padding:   "32px",
                    border:    "none",
                  }}
                >
                  No drivers match the current filters.
                </td>
              </tr>
            )}
            {displayed.map(s => (
              <tr
                key={s.driver.id}
                style={{ background: "var(--color-surface)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-surface-2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--color-surface)")}
              >
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  <Link
                    to={`/dashboard/drivers/${s.driver.id}`}
                    style={{
                      color:          "var(--color-link)",
                      textDecoration: "none",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--color-link-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--color-link)")}
                  >
                    {s.driver.name}
                  </Link>
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {s.sessions}
                </td>
                <td style={{ ...tdStyle, fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "var(--color-text-muted)" }}>
                  {s.lastTripDate
                    ? new Date(s.lastTripDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {s.sessions > 0 ? `${s.avgDrowsyPercent}%` : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "13px" }}>
                  <span style={{ color: s.sessions > 0 ? getRiskColor(s.peakRiskScore) : "var(--color-text-muted)" }}>
                    {s.sessions > 0 ? s.peakRiskScore.toFixed(2) : "—"}
                  </span>
                </td>
                <td style={tdStyle}>
                  {s.sessions > 0
                    ? <ScoreBar score={s.avgSafetyScore} />
                    : <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>No data</span>}
                </td>
                <td style={tdStyle}>
                  <StatusBadge status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <p
        style={{
          marginTop:  "20px",
          fontSize:   "11px",
          color:      "var(--color-text-muted)",
          lineHeight: 1.6,
        }}
      >
        Analytics only — not a medical or legal assessment tool. Experimental driver-fatigue metrics.
        Model {latestModel} · Data scoped to {company?.name}.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  mono,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background:   "var(--color-surface)",
        border:       "1px solid var(--color-border)",
        borderRadius: "6px",
        padding:      "16px 18px",
      }}
    >
      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", letterSpacing: "0.06em", marginBottom: "6px" }}>
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize:   "26px",
          fontWeight: mono ? 400 : 600,
          fontFamily: mono ? "IBM Plex Mono, monospace" : undefined,
          color:      valueColor ?? "var(--color-text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
