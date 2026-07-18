export function ProgressBar({ value, className = "", showLabel = false }: { value: number; className?: string; showLabel?: boolean }) {
  const pct = Math.max(0, Math.min(1, value));
  const rounded = Math.round(pct * 100);
  return (
    <div className={`progress ${className}`} role="progressbar" aria-valuenow={rounded} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${rounded}%` }} />
      {showLabel && <span className="mono" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600, color: pct > 0.4 ? "#1a1206" : "var(--on-surface)" }}>{rounded}%</span>}
    </div>
  );
}
