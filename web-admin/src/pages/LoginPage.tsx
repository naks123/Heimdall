import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { COMPANIES, DRIVERS } from "../services/mockData";
import { useAuth } from "../services/auth";

const sel: React.CSSProperties = {
  width:           "100%",
  background:      "var(--color-surface-2)",
  color:           "var(--color-text-primary)",
  border:          "1px solid var(--color-border-2)",
  borderRadius:    "4px",
  padding:         "8px 10px",
  fontSize:        "14px",
  fontFamily:      "Syne, sans-serif",
  marginTop:       "8px",
  outline:         "none",
  appearance:      "none",
};

const btn: React.CSSProperties = {
  width:        "100%",
  padding:      "10px",
  marginTop:    "14px",
  borderRadius: "4px",
  border:       "1px solid var(--color-border-2)",
  background:   "var(--color-surface-2)",
  color:        "var(--color-text-primary)",
  fontSize:     "14px",
  fontFamily:   "Syne, sans-serif",
  fontWeight:   500,
  cursor:       "pointer",
  transition:   "border-color 0.15s, color 0.15s",
};

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [companyId, setCompanyId]  = useState(COMPANIES[0].id);
  const [driverId,  setDriverId]   = useState(DRIVERS[0].id);

  function handleCompany() {
    login("company", companyId);
    nav("/dashboard");
  }

  function handleDriver() {
    login("driver", driverId);
    nav("/profile");
  }

  return (
    <div
      style={{
        minHeight:      "100vh",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "24px",
        background:     "var(--color-page)",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "48px", textAlign: "center" }}>
        <div
          style={{
            fontSize:      "22px",
            fontWeight:    700,
            color:         "var(--color-text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          Heimdall
        </div>
        <div
          style={{
            fontSize:   "12px",
            color:      "var(--color-text-muted)",
            marginTop:  "4px",
          }}
        >
          Driver Safety Analytics
        </div>
      </div>

      <div
        style={{
          display:   "flex",
          gap:       "20px",
          flexWrap:  "wrap",
          justifyContent: "center",
          width:     "100%",
          maxWidth:  "720px",
        }}
      >
        {/* Company card */}
        <Card title="I'm an admin" sub="Access your fleet dashboard">
          <label style={{ color: "var(--color-text-secondary)", fontSize: "12px" }}>
            Select company
          </label>
          <div style={{ position: "relative" }}>
            <select style={sel} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              {COMPANIES.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button style={btn} onClick={handleCompany}>
            Access dashboard →
          </button>
        </Card>

        {/* Driver card */}
        <Card title="I'm a driver" sub="View your safety profile">
          <label style={{ color: "var(--color-text-secondary)", fontSize: "12px" }}>
            Select driver
          </label>
          <div style={{ position: "relative" }}>
            <select style={sel} value={driverId} onChange={e => setDriverId(e.target.value)}>
              {DRIVERS.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <button style={btn} onClick={handleDriver}>
            View my profile →
          </button>
        </Card>
      </div>

      <p
        style={{
          marginTop: "48px",
          fontSize:  "11px",
          color:     "var(--color-text-muted)",
          textAlign: "center",
          maxWidth:  "480px",
        }}
      >
        Demo mode — no real authentication. Select any account to explore the platform.
      </p>
    </div>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex:         "1 1 300px",
        maxWidth:     "340px",
        background:   "var(--color-surface)",
        border:       "1px solid var(--color-border)",
        borderRadius: "6px",
        padding:      "24px",
      }}
    >
      <div
        style={{
          fontWeight:   600,
          fontSize:     "15px",
          color:        "var(--color-text-primary)",
          marginBottom: "4px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize:     "12px",
          color:        "var(--color-text-muted)",
          marginBottom: "20px",
        }}
      >
        {sub}
      </div>
      {children}
    </div>
  );
}
