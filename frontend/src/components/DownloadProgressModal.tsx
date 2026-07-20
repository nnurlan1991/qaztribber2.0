import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../store";
import { cancelPreload } from "../api";
import { Icon } from "../icons";
import { ProgressBar } from "./ProgressBar";

interface DownloadProgressModalProps {
  onClose: () => void;
}

interface ByteProgress {
  downloaded: number;
  total: number;
  unit: string;
}

/** Parse "Скачивание 220M: 500 МБ / 880 МБ" into {downloaded, total, unit} */
function parseBytes(stage: string): ByteProgress | null {
  const regex = /(\d+(?:\.?\d+)?)\s*(МБ|MB|ГБ|GB)\s*\/\s*(\d+(?:\.?\d+)?)\s*(МБ|MB|ГБ|GB)/i;
  const match = stage.match(regex);
  if (!match) return null;
  let downloaded = parseFloat(match[1]);
  let total = parseFloat(match[3]);
  const downloadedUnit = match[2].toUpperCase();
  const totalUnit = match[4].toUpperCase();
  // Normalize to same unit
  if (downloadedUnit.startsWith("Г") && totalUnit.startsWith("М")) {
    downloaded *= 1024;
  } else if (downloadedUnit.startsWith("М") && totalUnit.startsWith("Г")) {
    total *= 1024;
  }
  // Use the larger unit
  const unit = totalUnit.startsWith("Г") || downloadedUnit.startsWith("Г") ? "ГБ" : "МБ";
  return { downloaded, total, unit };
}

function formatBytes(value: number, unit: string): string {
  if (unit === "ГБ") {
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`;
  }
  return `${Math.round(value)} ${unit}`;
}

/** Extract model ID from stage text like "Скачивание 220M: ..." */
function parseModelId(stage: string): string | null {
  const match = stage.match(/(?:Downloading|Скачивание)\s+(220M|600M)/i);
  return match ? match[1].toLowerCase() : null;
}

export function DownloadProgressModal({ onClose }: DownloadProgressModalProps) {
  const { preload, t, refreshPreload, setError } = useApp();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const prevProgressRef = useRef<number>(0);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  // Track elapsed time and compute ETA
  useEffect(() => {
    if (!preload || preload.progress <= 0) {
      startTimeRef.current = Date.now();
      prevProgressRef.current = 0;
      setEtaMinutes(null);
      return;
    }

    if (preload.progress >= 1) {
      setEtaMinutes(null);
      return;
    }

    const now = Date.now();
    const elapsedSec = (now - startTimeRef.current) / 1000;
    if (elapsedSec < 2) return; // Wait for meaningful sample

    const progressDelta = preload.progress - prevProgressRef.current;
    if (progressDelta <= 0) return;

    const ratePerSec = progressDelta / elapsedSec;
    if (ratePerSec <= 0) return;

    const remaining = (1 - preload.progress) / ratePerSec;
    setEtaMinutes(Math.max(1, Math.round(remaining / 60)));

    // Reset tracking for next interval
    startTimeRef.current = now;
    prevProgressRef.current = preload.progress;
  }, [preload?.progress]);

  // Auto-close after 2s on terminal status
  useEffect(() => {
    if (!preload) return;
    const terminal = ["completed", "failed", "cancelled"].includes(preload.status);
    if (!terminal) return;
    const timer = window.setTimeout(() => onClose(), 2000);
    return () => window.clearTimeout(timer);
  }, [preload?.status, onClose]);

  const handleCancel = useCallback(async () => {
    if (cancelRequested) return;
    setCancelRequested(true);
    try {
      await cancelPreload();
      await refreshPreload();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setCancelRequested(false);
      setShowCancelConfirm(false);
    }
  }, [cancelRequested, refreshPreload, setError]);

  const handleClose = useCallback(() => {
    // Close modal but download continues in background
    onClose();
  }, [onClose]);

  const stageBytes = preload ? parseBytes(preload.stage) : null;
  const modelHint = preload ? parseModelId(preload.stage) : null;
  const progress = preload?.progress ?? 0;
  const isDownloading = preload?.status === "downloading";
  const isPaused = preload?.status === "paused";
  const isCompleted = preload?.status === "completed";
  const isFailed = preload?.status === "failed";
  const isCancelled = preload?.status === "cancelled";
  const isTerminal = isCompleted || isFailed || isCancelled;

  const statusIcon = isCompleted ? "check_circle" : isFailed ? "error" : isCancelled ? "cancel" : isPaused ? "pause" : "cloud_download";
  const statusLabel = isCompleted ? t("download.completed") : isFailed ? t("download.failed") : isCancelled ? t("download.cancelled") : isPaused ? t("download.paused") : "";

  return (
    <>
      <style>{`@keyframes qzt-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(480px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
            {isTerminal ? (
              <Icon name={statusIcon} size={24} style={{ color: isCompleted ? "var(--status-done)" : isFailed ? "var(--status-err)" : "var(--on-surface-variant)" }} />
            ) : (
              <Icon name="autorenew" size={24} style={{ animation: "qzt-spin 1s linear infinite" }} />
            )}
            <div>
              <h3 className="h3" style={{ margin: 0 }}>{t("download.title")}</h3>
              {statusLabel && (
                <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{statusLabel}</span>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={handleClose} title={t("download.close")}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Model cards */}
        {["220m", "600m"].map((modelId) => {
          const isActive = !modelHint || modelHint === modelId;
          const modelProgress = isActive ? progress : 0;
          // Only the active model shows progress; the other stays at 0
          return (
            <div
              key={modelId}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--sp-2)",
                padding: "var(--sp-4)",
                borderRadius: "var(--r-md)",
                background: "var(--overlay-bg)",
                border: "1px solid var(--border-soft)",
                marginBottom: "var(--sp-3)",
                opacity: isActive ? 1 : 0.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-1)" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    fontWeight: 700,
                    color: isActive ? "var(--gold-shimmer)" : "var(--on-surface-variant)",
                    flex: "0 0 auto",
                  }}
                >
                  {modelId === "220m" ? "220M" : "600M"}
                </span>
                <span style={{ fontSize: 12, color: "var(--on-surface-variant)", flex: 1 }}>
                  {modelId === "220m" ? "~880 МБ" : "~2.3 ГБ"}
                </span>
                {isActive && isDownloading && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gold-shimmer)", fontFamily: "var(--font-mono)" }}>
                    {Math.round(modelProgress * 100)}%
                  </span>
                )}
                {isActive && isCompleted && (
                  <Icon name="check_circle" size={18} style={{ color: "var(--status-done)" }} />
                )}
              </div>

              {/* Progress bar */}
              {isActive && (
                <ProgressBar value={modelProgress} />
              )}

              {/* Bytes detail */}
              {isActive && stageBytes && isDownloading && (
                <div style={{ fontSize: 11, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)" }}>
                  {formatBytes(stageBytes.downloaded, stageBytes.unit)} / {formatBytes(stageBytes.total, stageBytes.unit)}
                </div>
              )}

              {/* Completed check mark */}
              {isActive && isCompleted && (
                <div style={{ fontSize: 12, color: "var(--status-done)" }}>
                  {t("download.completed")}
                </div>
              )}
            </div>
          );
        })}

        {/* Stage text */}
        {preload && preload.stage && isDownloading && (
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginBottom: "var(--sp-4)", textAlign: "center", lineHeight: 1.5 }}>
            {preload.stage}
          </div>
        )}

        {/* ETA */}
        {etaMinutes !== null && isDownloading && (
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", textAlign: "center", marginBottom: "var(--sp-4)" }}>
            {t("download.eta", { minutes: etaMinutes })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
          {showCancelConfirm ? (
            <>
              <span style={{ fontSize: 12, color: "var(--on-surface-variant)", flex: 1, alignSelf: "center" }}>
                {t("download.cancelConfirm")}
              </span>
              <button className="btn btn-ghost sm" onClick={() => setShowCancelConfirm(false)}>
                {t("download.continue")}
              </button>
              <button className="btn btn-gold sm" onClick={handleCancel} disabled={cancelRequested}>
                {cancelRequested ? t("common.loading") : t("common.yes")}
              </button>
            </>
          ) : (
            <>
              {isDownloading && (
                <button className="btn btn-ghost sm" onClick={() => setShowCancelConfirm(true)}>
                  <Icon name="cancel" size={16} style={{ marginRight: 4 }} />
                  {t("download.cancel")}
                </button>
              )}
              {isTerminal && (
                <button className="btn btn-gold sm" onClick={handleClose}>
                  {t("common.close")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
