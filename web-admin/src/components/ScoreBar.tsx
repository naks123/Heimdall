import { getScoreColor } from "../services/scoring";

export default function ScoreBar({ score }: { score: number }) {
  const color = getScoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          width:        "80px",
          height:       "5px",
          borderRadius: "2px",
          background:   "var(--color-surface-2)",
          overflow:     "hidden",
          flexShrink:   0,
        }}
      >
        <div
          style={{
            height:      "100%",
            width:       `${score}%`,
            background:  color,
            borderRadius: "2px",
          }}
        />
      </div>
      <span
        className="font-mono"
        style={{ fontSize: "12px", color, minWidth: "28px" }}
      >
        {score}
      </span>
    </div>
  );
}
