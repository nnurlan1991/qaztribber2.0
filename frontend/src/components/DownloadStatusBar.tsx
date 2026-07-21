import { useApp } from "../store";
import { Icon } from "../icons";
import { ProgressBar } from "./ProgressBar";

interface DownloadStatusBarProps {
  onOpenDetails: () => void;
}

/**
 * Sticky global progress bar shown at the top of the main area whenever models
 * are being downloaded or paused. Click anywhere to open the detailed modal.
 *
 * Visible only while `preload.status` is `downloading` or `paused`.
 */
export function DownloadStatusBar({ onOpenDetails }: DownloadStatusBarProps) {
  const { preload, t } = useApp();

  if (!preload) return null;
  const isActive = preload.status === "downloading" || preload.status === "paused";
  if (!isActive) return null;

  const percent = Math.round(preload.progress * 100);
  const isPaused = preload.status === "paused";

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      title={t("download.barHint")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-3)",
        width: "100%",
        padding: "10px 16px",
        background: "linear-gradient(90deg, rgba(247, 189, 72, 0.08), rgba(247, 189, 72, 0.16))",
        borderBottom: "1px solid rgba(247, 189, 72, 0.3)",
        borderTop: "1px solid rgba(247, 189, 72, 0.2)",
        color: "var(--on-surface)",
        cursor: "pointer",
        textAlign: "left",
        border: "none",
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: "rgba(247, 189, 72, 0.3)",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "linear-gradient(90deg, rgba(247, 189, 72, 0.12), rgba(247, 189, 72, 0.22))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "linear-gradient(90deg, rgba(247, 189, 72, 0.08), rgba(247, 189, 72, 0.16))";
      }}
    >
      <Icon
        name={isPaused ? "pause" : "autorenew"}
        size={18}
        style={{
          color: "var(--gold-shimmer)",
          flex: "0 0 auto",
          animation: isPaused ? undefined : "qzt-spin 1.4s linear infinite",
        }}
      />
      <div style={{ flex: "0 0 auto", minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gold-shimmer)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {isPaused ? t("download.paused") : t("download.barTitle")}
        </div>
        <div style={{ fontSize: 11, color: "var(--on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 380 }}>
          {preload.stage || ""}
        </div>
      </div>
      <div style={{ flex: 1, maxWidth: 320 }}>
        <ProgressBar value={preload.progress} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--gold-shimmer)", minWidth: 48, textAlign: "right" }}>
        {percent}%
      </span>
      <Icon name="chevron_right" size={18} style={{ color: "var(--on-surface-variant)", flex: "0 0 auto" }} />
    </button>
  );
}
