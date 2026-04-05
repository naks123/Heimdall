import { type SafetyStatus } from "../services/scoring";

const CONFIG: Record<SafetyStatus, { bg: string; text: string; border: string }> = {
  Safe: {
    bg:     "var(--color-safe-bg)",
    text:   "var(--color-safe-text)",
    border: "var(--color-safe-border)",
  },
  Attention: {
    bg:     "var(--color-warn-bg)",
    text:   "var(--color-warn-text)",
    border: "var(--color-warn-border)",
  },
  "High Risk": {
    bg:     "var(--color-risk-bg)",
    text:   "var(--color-risk-text)",
    border: "var(--color-risk-border)",
  },
};

export default function StatusBadge({ status }: { status: SafetyStatus }) {
  const c = CONFIG[status];
  return (
    <span
      style={{
        display:       "inline-block",
        padding:       "2px 7px",
        fontSize:      "11px",
        fontWeight:    500,
        letterSpacing: "0.02em",
        borderRadius:  "3px",
        border:        `1px solid ${c.border}`,
        background:    c.bg,
        color:         c.text,
        whiteSpace:    "nowrap",
      }}
    >
      {status}
    </span>
  );
}
