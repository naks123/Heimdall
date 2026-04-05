import { useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useAuth } from "../services/auth";
import {
  getDriverProfile,
  getDriverIdFromToken,
  createShareToken,
  revokeShareToken,
  type DriverProfileData,
} from "../services/api";
import { calcSafetyScore, getStatus, getRiskColor, getScoreColor } from "../services/scoring";
import { DRIVERS } from "../services/mockData";
import StatusBadge from "../components/StatusBadge";
import ScoreBar from "../components/ScoreBar";

export type ProfileContext = "company-admin" | "driver-self" | "public";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding:       "9px 12px",
  textAlign:     "left",
  fontSize:      "10px",
  fontWeight:    500,
  letterSpacing: "0.07em",
  color:         "var(--color-text-muted)",
  borderBottom:  "1px solid var(--color-border)",
  whiteSpace:    "nowrap",
};

const tdSt: React.CSSProperties = {
  padding:      "11px 12px",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace:   "nowrap",
  fontSize:     "13px",
};

const cardSt: React.CSSProperties = {
  background:   "var(--color-surface)",
  border:       "1px solid var(--color-border)",
  borderRadius: "6px",
  padding:      "16px 18px",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverProfile({ context }: { context: ProfileContext }) {
  const { auth }       = useAuth();
  const { driverId: urlDriverId, shareToken } = useParams<{ driverId?: string; shareToken?: string }>();
  const nav = useNavigate();

  // Resolve driverId from context
  const driverId: string | null = useMemo(() => {
    if (context === "company-admin") return urlDriverId ?? null;
    if (context === "driver-self")   return auth.driverId ?? null;
    if (context === "public" && shareToken) return getDriverIdFromToken(shareToken);
    return null;
  }, [context, urlDriverId, auth.driverId, shareToken]);

  const viewerCompanyId = context === "company-admin" ? auth.companyId : undefined;

  const data: DriverProfileData | null = useMemo(() => {
    if (!driverId) return null;
    return getDriverProfile(driverId, viewerCompanyId);
  }, [driverId, viewerCompanyId]);

  // Share controls state
  const [shareLink,   setShareLink]   = useState<{ token: string; url: string } | null>(null);
  const [shareEmail,  setShareEmail]  = useState("");
  const [copied,      setCopied]      = useState(false);

  function handleGenerateLink() {
    if (!driverId) return;
    setShareLink(createShareToken(driverId));
  }

  function handleRevoke() {
    if (shareLink) revokeShareToken(shareLink.token);
    setShareLink(null);
  }

  function handleCopy() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!driverId || !data) {
    return (
      <div style={{ padding: "48px 24px", color: "var(--color-text-muted)", textAlign: "center" }}>
        {context === "public"
          ? "This share link is invalid or has been revoked."
          : "Driver not found."}
      </div>
    );
  }

  const { driver, employments, trips, viewerEmployment, stats, monthlyTrend } = data;
  const currentEmployer = employments.find(e => e.endDate === null);
  const latestModel     = trips.length > 0 ? trips[trips.length - 1].modelVersion : "v2.1.0";

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px 80px" }}>

      {/* Back nav */}
      {context === "company-admin" && (
        <button
          onClick={() => nav("/dashboard")}
          style={{
            background:    "none",
            border:        "none",
            color:         "var(--color-link)",
            cursor:        "pointer",
            fontSize:      "13px",
            padding:       "0 0 20px",
            display:       "block",
            fontFamily:    "Syne, sans-serif",
          }}
        >
          ← Fleet Dashboard
        </button>
      )}

      {/* Public banner */}
      {context === "public" && (
        <div
          style={{
            background:   "var(--color-surface)",
            border:       "1px solid var(--color-border)",
            borderRadius: "6px",
            padding:      "10px 16px",
            marginBottom: "24px",
            fontSize:     "12px",
            color:        "var(--color-text-muted)",
            display:      "flex",
            alignItems:   "center",
            gap:          "10px",
          }}
        >
          <span
            style={{
              background:   "var(--color-safe-bg)",
              border:       "1px solid var(--color-safe-border)",
              color:        "var(--color-safe-text)",
              fontSize:     "10px",
              fontWeight:   600,
              padding:      "2px 7px",
              borderRadius: "3px",
              letterSpacing:"0.04em",
            }}
          >
            VERIFIED BY HEIMDALL
          </span>
          This safety profile was shared by {driver.name}. Trip history shown is complete across all employers.
        </div>
      )}

      {/* Employment banner (company admin) */}
      {context === "company-admin" && viewerEmployment && (
        <div
          style={{
            background:   "var(--color-surface)",
            border:       "1px solid var(--color-border)",
            borderRadius: "6px",
            padding:      "10px 16px",
            marginBottom: "24px",
            fontSize:     "12px",
            color:        "var(--color-text-secondary)",
          }}
        >
          Showing trips during employment at{" "}
          <strong style={{ color: "var(--color-text-primary)" }}>
            {DRIVERS.find(d => d.id === driverId)
              ? (() => {
                  const emp = viewerEmployment;
                  return emp.companyId.charAt(0).toUpperCase() + emp.companyId.slice(1);
                })()
              : viewerEmployment.companyId}
          </strong>{" "}
          ({fmtDate(viewerEmployment.startDate)} –{" "}
          {viewerEmployment.endDate ? fmtDate(viewerEmployment.endDate) : "present"})
        </div>
      )}

      {/* Profile header */}
      <div
        style={{
          background:   "var(--color-surface)",
          border:       "1px solid var(--color-border)",
          borderRadius: "6px",
          padding:      "24px 28px",
          marginBottom: "20px",
          display:      "flex",
          alignItems:   "flex-start",
          gap:          "24px",
          flexWrap:     "wrap",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width:          "52px",
            height:         "52px",
            borderRadius:   "6px",
            background:     "var(--color-surface-2)",
            border:         "1px solid var(--color-border-2)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            fontSize:       "17px",
            fontWeight:     600,
            color:          "var(--color-text-secondary)",
            flexShrink:     0,
          }}
        >
          {initials(driver.name)}
        </div>

        {/* Identity */}
        <div style={{ flex: 1, minWidth: "220px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-text-primary)" }}>
              {driver.name}
            </span>
            {context === "public" && (
              <span
                style={{
                  fontSize:     "10px",
                  fontWeight:   600,
                  letterSpacing:"0.05em",
                  color:        "var(--color-safe-text)",
                  border:       "1px solid var(--color-safe-border)",
                  background:   "var(--color-safe-bg)",
                  padding:      "2px 7px",
                  borderRadius: "3px",
                }}
              >
                VERIFIED
              </span>
            )}
          </div>
          <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--color-text-muted)" }}>
            {currentEmployer
              ? `Currently at ${(() => {
                  const names: Record<string, string> = { amazon: "Amazon Logistics", cta: "Chicago Transit Authority", fedex: "FedEx Ground" };
                  return names[currentEmployer.companyId] ?? currentEmployer.companyId;
                })()}`
              : "No current employer on record"}
            {" · "}Member since {fmtDate(driver.memberSince)}
            {" · "}{stats.totalSessions} sessions
          </div>
          {employments.length > 1 && (
            <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--color-text-muted)" }}>
              {employments.length} employers in history
            </div>
          )}
        </div>

        {/* Score */}
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize:   "42px",
              fontWeight: 400,
              fontFamily: "IBM Plex Mono, monospace",
              color:      getScoreColor(stats.avgSafetyScore),
              lineHeight: 1,
            }}
          >
            {stats.avgSafetyScore}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
            overall safety score
          </div>
          {stats.scoreTrend90 !== 0 && (
            <div
              style={{
                marginTop: "6px",
                fontSize:  "12px",
                fontFamily:"IBM Plex Mono, monospace",
                color:     stats.scoreTrend90 > 0 ? "var(--color-safe-text)" : "var(--color-risk-text)",
              }}
            >
              {stats.scoreTrend90 > 0 ? "↑" : "↓"} {Math.abs(stats.scoreTrend90)} pts last 90 days
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap:                 "12px",
          marginBottom:        "24px",
        }}
      >
        <SummaryCard label="Avg Drowsy %" value={`${stats.avgDrowsyPercent}%`} />
        <SummaryCard
          label="Peak Risk Score"
          value={stats.peakRiskScore.toFixed(2)}
          valueColor={getRiskColor(stats.peakRiskScore)}
        />
        <SummaryCard label="Total Sessions" value={String(stats.totalSessions)} />
        <SummaryCard
          label="Score Trend (90d)"
          value={stats.scoreTrend90 === 0 ? "—" : `${stats.scoreTrend90 > 0 ? "+" : ""}${stats.scoreTrend90}`}
          valueColor={
            stats.scoreTrend90 > 0
              ? "var(--color-safe-text)"
              : stats.scoreTrend90 < 0
              ? "var(--color-risk-text)"
              : undefined
          }
        />
      </div>

      {/* Trend chart */}
      <div style={{ ...cardSt, marginBottom: "24px" }}>
        <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "16px", letterSpacing: "0.04em" }}>
          MONTHLY AVG SAFETY SCORE — LAST 6 MONTHS
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={monthlyTrend} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background:  "var(--color-surface-2)",
                border:      "1px solid var(--color-border-2)",
                borderRadius:"4px",
                fontFamily:  "Syne, sans-serif",
                fontSize:    "12px",
                color:       "var(--color-text-primary)",
              }}
              formatter={(v: number) => [v, "Avg score"]}
            />
            <ReferenceLine
              y={70}
              stroke="var(--color-safe-text)"
              strokeDasharray="4 3"
              strokeOpacity={0.6}
              label={{
                value:    "Safe threshold",
                position: "insideTopRight",
                fill:     "var(--color-safe-text)",
                fontSize: 10,
              }}
            />
            <Line
              type="monotone"
              dataKey="avgScore"
              stroke="var(--color-text-secondary)"
              strokeWidth={1.5}
              dot={{ fill: "var(--color-text-secondary)", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              name="Avg score"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Trip history table */}
      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            fontSize:     "12px",
            color:        "var(--color-text-muted)",
            letterSpacing:"0.04em",
            marginBottom: "12px",
          }}
        >
          TRIP HISTORY {context === "company-admin" && viewerEmployment ? "(EMPLOYMENT WINDOW)" : ""}
        </div>
        <div
          style={{
            border:       "1px solid var(--color-border)",
            borderRadius: "6px",
            overflow:     "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
              <thead style={{ background: "var(--color-surface)" }}>
                <tr>
                  <th style={thSt}>DATE</th>
                  <th style={thSt}>ROUTE</th>
                  <th style={{ ...thSt, textAlign: "right" }}>DURATION</th>
                  <th style={{ ...thSt, textAlign: "right" }}>COVERAGE</th>
                  <th style={{ ...thSt, textAlign: "right" }}>DROWSY %</th>
                  <th style={{ ...thSt, textAlign: "right" }}>PEAK RISK</th>
                  <th style={{ ...thSt, textAlign: "right" }}>YAWNS</th>
                  <th style={{ ...thSt, textAlign: "right" }}>PEC</th>
                  <th style={thSt}>SCORE</th>
                  <th style={thSt}>MODEL</th>
                  <th style={thSt}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {[...trips].reverse().map(trip => {
                  const score    = calcSafetyScore(trip);
                  const status   = getStatus(score);
                  const coverage = Math.round((trip.monitoringDurationSec / trip.totalDriveDurationSec) * 100);
                  return (
                    <tr
                      key={trip.id}
                      style={{ background: "var(--color-surface)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-surface-2)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "var(--color-surface)")}
                    >
                      <td style={{ ...tdSt, fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "var(--color-text-muted)" }}>
                        {fmtDate(trip.date)}
                      </td>
                      <td style={{ ...tdSt, color: "var(--color-text-secondary)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {trip.origin} → {trip.destination}
                      </td>
                      <td style={{ ...tdSt, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                        {fmtDuration(trip.totalDriveDurationSec)}
                      </td>
                      <td style={{ ...tdSt, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "var(--color-text-muted)" }}>
                        {coverage}%
                      </td>
                      <td style={{ ...tdSt, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                        {trip.drowsyPercent}%
                      </td>
                      <td style={{ ...tdSt, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px" }}>
                        <span style={{ color: getRiskColor(trip.maxRiskScore) }}>
                          {trip.maxRiskScore.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ ...tdSt, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                        {trip.yawnCount}
                      </td>
                      <td style={{ ...tdSt, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                        {trip.prolongedEyeClosureCount}
                      </td>
                      <td style={tdSt}>
                        <ScoreBar score={score} />
                      </td>
                      <td style={{ ...tdSt, fontFamily: "IBM Plex Mono, monospace", fontSize: "11px", color: "var(--color-text-muted)" }}>
                        {trip.modelVersion}
                      </td>
                      <td style={tdSt}>
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  );
                })}
                {trips.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      style={{
                        ...tdSt,
                        color:     "var(--color-text-muted)",
                        textAlign: "center",
                        padding:   "32px",
                        border:    "none",
                      }}
                    >
                      No trips in this scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ marginTop: "8px", fontSize: "11px", color: "var(--color-text-muted)" }}>
          {trips.length} trip{trips.length !== 1 ? "s" : ""} shown · Model version recorded per trip
          {context === "company-admin" && " · Scoped to employment window"}
        </p>
      </div>

      {/* Share controls — driver self only */}
      {context === "driver-self" && (
        <div style={{ ...cardSt, marginBottom: "24px" }}>
          <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--color-text-primary)", marginBottom: "8px" }}>
            Share your safety report
          </div>
          <p style={{ margin: "0 0 16px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: "560px" }}>
            Send your verified Heimdall profile to a prospective employer. They will see your score
            history, trip metrics, and improvement trend. They cannot see your current employer's
            private fleet data.
          </p>

          {/* Email send */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <input
              type="email"
              placeholder="employer@company.com"
              value={shareEmail}
              onChange={e => setShareEmail(e.target.value)}
              style={{
                flex:        "1 1 220px",
                padding:     "7px 10px",
                background:  "var(--color-surface-2)",
                border:      "1px solid var(--color-border-2)",
                borderRadius:"4px",
                color:       "var(--color-text-primary)",
                fontSize:    "13px",
                fontFamily:  "Syne, sans-serif",
                outline:     "none",
              }}
            />
            <button
              disabled={!shareEmail}
              style={{
                padding:      "7px 16px",
                background:   "var(--color-surface-2)",
                border:       "1px solid var(--color-border-2)",
                borderRadius: "4px",
                color:        shareEmail ? "var(--color-text-primary)" : "var(--color-text-muted)",
                fontSize:     "13px",
                fontFamily:   "Syne, sans-serif",
                cursor:       shareEmail ? "pointer" : "not-allowed",
              }}
            >
              Send report
            </button>
          </div>

          {/* Shareable link */}
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>
              Shareable link
            </div>
            {shareLink ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <code
                  style={{
                    flex:        "1 1 300px",
                    padding:     "6px 10px",
                    background:  "var(--color-page)",
                    border:      "1px solid var(--color-border)",
                    borderRadius:"4px",
                    fontSize:    "11px",
                    fontFamily:  "IBM Plex Mono, monospace",
                    color:       "var(--color-text-secondary)",
                    overflow:    "hidden",
                    textOverflow:"ellipsis",
                    whiteSpace:  "nowrap",
                  }}
                >
                  {shareLink.url}
                </code>
                <button onClick={handleCopy} style={linkBtn}>
                  {copied ? "Copied" : "Copy"}
                </button>
                <button onClick={handleRevoke} style={{ ...linkBtn, color: "var(--color-risk-text)", borderColor: "var(--color-risk-border)" }}>
                  Revoke
                </button>
              </div>
            ) : (
              <button onClick={handleGenerateLink} style={linkBtn}>
                Generate link
              </button>
            )}
            <p style={{ margin: "10px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
              You control who sees this. Links can be revoked at any time.
            </p>
          </div>
        </div>
      )}

      {/* Model note */}
      <p style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
        Analytics only — not a medical or legal assessment tool. Experimental driver-fatigue metrics.
        Latest model in dataset: {latestModel}
      </p>

      {/* Public footer */}
      {context === "public" && (
        <div
          style={{
            marginTop:   "32px",
            paddingTop:  "16px",
            borderTop:   "1px solid var(--color-border)",
            textAlign:   "center",
            fontSize:    "11px",
            color:       "var(--color-text-muted)",
          }}
        >
          <Link
            to="/"
            style={{ color: "var(--color-text-muted)", textDecoration: "none", letterSpacing: "0.04em" }}
          >
            Powered by Heimdall
          </Link>
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  padding:      "6px 14px",
  background:   "var(--color-surface-2)",
  border:       "1px solid var(--color-border-2)",
  borderRadius: "4px",
  color:        "var(--color-text-secondary)",
  fontSize:     "12px",
  fontFamily:   "Syne, sans-serif",
  cursor:       "pointer",
  whiteSpace:   "nowrap",
};

function SummaryCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={cardSt}>
      <div style={{ fontSize: "10px", color: "var(--color-text-muted)", letterSpacing: "0.07em", marginBottom: "8px" }}>
        {label.toUpperCase()}
      </div>
      <div
        className="font-mono"
        style={{ fontSize: "22px", color: valueColor ?? "var(--color-text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}
