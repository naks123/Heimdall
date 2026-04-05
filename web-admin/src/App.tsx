import { type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./services/auth";
import { COMPANIES, DRIVERS } from "./services/mockData";
import LoginPage      from "./pages/LoginPage";
import FleetDashboard from "./pages/FleetDashboard";
import DriverProfile  from "./pages/DriverProfile";

// ─── Route guards ─────────────────────────────────────────────────────────────

function RequireCompany({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  return auth.type === "company" ? <>{children}</> : <Navigate to="/" replace />;
}

function RequireDriver({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  return auth.type === "driver" ? <>{children}</> : <Navigate to="/" replace />;
}

// ─── Global header ────────────────────────────────────────────────────────────

function Header() {
  const { auth, logout } = useAuth();
  if (!auth.type) return null;

  const company = auth.companyId ? COMPANIES.find(c => c.id === auth.companyId) : null;
  const driver  = auth.driverId  ? DRIVERS.find(d => d.id === auth.driverId)   : null;
  const homeUrl = auth.type === "company" ? "/dashboard" : "/profile";

  return (
    <header
      style={{
        borderBottom: "1px solid var(--color-border)",
        background:   "var(--color-surface)",
        position:     "sticky",
        top:          0,
        zIndex:       100,
      }}
    >
      <div
        style={{
          maxWidth:      "1280px",
          margin:        "0 auto",
          padding:       "0 24px",
          height:        "52px",
          display:       "flex",
          alignItems:    "center",
          justifyContent:"space-between",
        }}
      >
        {/* Logo */}
        <Link
          to={homeUrl}
          style={{
            color:          "var(--color-text-primary)",
            textDecoration: "none",
            fontWeight:     700,
            fontSize:       "15px",
            letterSpacing:  "-0.01em",
          }}
        >
          Heimdall
        </Link>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {company && (
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span
                style={{
                  width:        "6px",
                  height:       "6px",
                  borderRadius: "50%",
                  background:   "var(--color-safe-text)",
                  flexShrink:   0,
                }}
              />
              <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                {company.name}
              </span>
            </div>
          )}
          {driver && (
            <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
              {driver.name}
            </span>
          )}
          <button
            onClick={logout}
            style={{
              background:   "none",
              border:       "none",
              color:        "var(--color-text-muted)",
              cursor:       "pointer",
              fontSize:     "12px",
              fontFamily:   "Syne, sans-serif",
              padding:      "4px 0",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────

function Shell() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-page)" }}>
      <Header />
      <Routes>
        <Route path="/"                          element={<LoginPage />} />
        <Route path="/dashboard"                 element={<RequireCompany><FleetDashboard /></RequireCompany>} />
        <Route path="/dashboard/drivers/:driverId" element={<RequireCompany><DriverProfile context="company-admin" /></RequireCompany>} />
        <Route path="/profile"                   element={<RequireDriver><DriverProfile context="driver-self" /></RequireDriver>} />
        <Route path="/profile/:shareToken"       element={<DriverProfile context="public" />} />
        <Route path="*"                          element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
