import { useState, useEffect } from "react";
import { deleteModel, getModelsStoragePath, openFolder, startPreload } from "../api";
import { useApp } from "../store";
import { Icon } from "../icons";
import { Modal } from "../components/Modal";
import { ProgressBar } from "../components/ProgressBar";
import { formatBytes } from "../storage";
import type { Model, ModelDownloadStatus } from "../api";

const MODEL_SIZE_HINT: Record<Model["id"], string> = {
  "220m": "~880 МБ",
  "600m": "~2.3 ГБ",
};

export function ModelsView() {
  const { t, models, preload, prefs, setPrefs, refreshModels, refreshPreload, setError } = useApp();
  const downloading = preload?.status === "downloading";
  const [deleteTarget, setDeleteTarget] = useState<typeof models[number] | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<typeof models[number] | null>(null);
  const [showPathModal, setShowPathModal] = useState(false);
  const [storagePath, setStoragePath] = useState<{ path: string; exists: boolean } | null>(null);
  const [pathCopied, setPathCopied] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState(false);

  // Detect platform for "Open in Finder / Explorer" label
  const isWindows = typeof navigator !== "undefined" && /Win/i.test(navigator.platform);
  const openFolderLabel = isWindows ? t("models.openFolderWin") : t("models.openFolder");

  useEffect(() => {
    if (!showPathModal) return;
    getModelsStoragePath()
      .then(setStoragePath)
      .catch(() => setStoragePath(null));
  }, [showPathModal]);

  // Per-model download status from preload snapshot
  const modelStatuses: ModelDownloadStatus[] = preload?.models ?? [];
  const getModelStatus = (modelId: Model["id"]): ModelDownloadStatus | null => {
    return modelStatuses.find((m) => m.model_id === modelId) ?? null;
  };

  async function confirmDownload() {
    if (!downloadTarget) return;
    setDownloadingModel(true);
    try {
      setError(null);
      await startPreload([downloadTarget.id]);
      await refreshPreload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.preload"));
    } finally {
      setDownloadingModel(false);
      setDownloadTarget(null);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      setError(null);
      await deleteModel(deleteTarget.id);
      await refreshModels();
      await refreshPreload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.modelDelete"));
    }
    setDeleteTarget(null);
  }

  async function copyStoragePath() {
    if (!storagePath) return;
    try {
      await navigator.clipboard.writeText(storagePath.path);
      setPathCopied(true);
      window.setTimeout(() => setPathCopied(false), 1800);
    } catch {
      // Clipboard may be blocked — ignore silently
    }
  }

  async function openStorageFolder() {
    if (!storagePath) return;
    const opened = await openFolder(storagePath.path);
    if (!opened) {
      setError(t("models.storagePathHint"));
    }
  }

  const cachedCount = models.filter((m) => m.cached).length;
  const totalSize = models.filter((m) => m.cached).reduce((acc, m) => acc + m.size_bytes, 0);

  return (
    <div className="content wide scroll">
      {/* Hero / status */}
      <section className="card pad-lg elev gold-edge mb-6" style={{ overflow: "hidden" }}>
        <div className="row-flex between gap-6" style={{ flexWrap: "wrap" }}>
          <div className="stack" style={{ gap: 2, flex: 1, minWidth: 240 }}>
            <span className="eyebrow">{t("settings.engineValue")}</span>
            <h1 className="h-display">{t("models.title")}</h1>
            <p className="muted mt-2">{t("models.subtitle")}</p>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2, minmax(120px, 1fr))" }}>
            <div className="stat">
              <div className="stat-num">{cachedCount}/{models.length}</div>
              <div className="stat-label">{t("models.cached")}</div>
            </div>
            <div className="stat">
              <div className="stat-num">{totalSize ? formatBytes(totalSize) : "—"}</div>
              <div className="stat-label">{t("models.storage")}</div>
            </div>
          </div>
        </div>

        {/* Show storage path button — subtle, in hero */}
        <div className="mt-4" style={{ display: "flex", justifyContent: "flex-start" }}>
          <button
            className="btn btn-ghost sm"
            onClick={() => setShowPathModal(true)}
            title={t("models.storagePathHint")}
            style={{ fontSize: 12, opacity: 0.8 }}
          >
            <Icon name="folder" size={14} />
            {t("models.showPath")}
          </button>
        </div>
      </section>

      {/* Model cards */}
      <div className="model-grid">
        {models.map((m) => {
          const isSelected = prefs.defaultModel === m.id;
          const ms = getModelStatus(m.id);
          const isModelDownloading = ms?.status === "downloading";
          const isModelFailed = ms?.status === "failed";
          const isModelPending = ms?.status === "pending" && downloading;
          const modelProgress = ms?.progress ?? 0;
          const isOverallFailed = preload?.status === "failed" && !m.cached;

          // Status label & color
          let statusLabel: string;
          let statusColor: string;
          let statusIcon: string | null = null;

          if (m.cached) {
            statusLabel = t("models.cachedShort");
            statusColor = "var(--status-done)";
            statusIcon = "check_circle";
          } else if (isModelDownloading) {
            statusLabel = `${Math.round(modelProgress * 100)}%`;
            statusColor = "var(--gold-shimmer)";
            statusIcon = "autorenew";
          } else if (isModelPending) {
            statusLabel = t("download.statusPending");
            statusColor = "var(--on-surface-variant)";
          } else if (isModelFailed || isOverallFailed) {
            statusLabel = t("models.failed");
            statusColor = "var(--status-err)";
            statusIcon = "error";
          } else {
            statusLabel = t("models.notCached");
            statusColor = "var(--on-surface-variant)";
          }

          return (
            <article
              key={m.id}
              className={`model-card ${isSelected ? "selected" : ""}`}
              style={isModelDownloading ? { borderColor: "var(--gold-shimmer)" } : undefined}
            >
              <div className="row-flex between">
                <span className="model-num">{m.parameters}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: statusColor }}>
                  {statusIcon && (
                    <Icon
                      name={statusIcon}
                      size={14}
                      style={isModelDownloading ? { animation: "qzt-spin 1s linear infinite" } : undefined}
                    />
                  )}
                  {statusLabel}
                </span>
              </div>
              <h2 className="h2 mt-2">{m.id === "220m" ? t("models.small") : t("models.large")}</h2>
              <p className="faint mt-2" style={{ fontSize: 13 }}>
                {m.id === "220m" ? t("models.smallDesc") : t("models.largeDesc")}
              </p>

              {/* Progress bar in-card when downloading */}
              {isModelDownloading && (
                <div className="mt-3" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <ProgressBar value={modelProgress} />
                  <div style={{ fontSize: 11, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)" }}>
                    {t("models.downloadProgress", { percent: Math.round(modelProgress * 100) })}
                  </div>
                </div>
              )}

              <div className="divider" />
              <div className="stack gap-2">
                <div className="row-flex between">
                  <span className="meta-key">{t("models.parameters")}</span>
                  <span className="mono">{m.parameters}</span>
                </div>
                <div className="row-flex between">
                  <span className="meta-key">{t("models.storage")}</span>
                  <span className="mono">{m.cached ? formatBytes(m.size_bytes) : MODEL_SIZE_HINT[m.id]}</span>
                </div>
                {m.storage_path && m.cached && (
                  <div className="row-flex between">
                    <span className="meta-key">{t("models.storagePath")}</span>
                    <span
                      className="mono"
                      title={m.storage_path}
                      style={{ fontSize: 10, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                      onClick={() => openFolder(m.storage_path!).catch(() => {})}
                    >
                      {m.storage_path}
                    </span>
                  </div>
                )}
              </div>

              <div className="row-flex gap-2 mt-4" style={{ flexWrap: "wrap" }}>
                <button
                  className={`btn sm ${isSelected ? "btn-soft" : "btn-ghost"}`}
                  disabled={isSelected || !m.cached}
                  onClick={() => setPrefs({ defaultModel: m.id })}
                  title={!m.cached ? t("models.notCachedHint") : undefined}
                >
                  <Icon name={isSelected ? "check" : "radio_button_unchecked"} size={16} fill={isSelected} />
                  {isSelected ? t("models.selected") : t("models.select")}
                </button>

                {/* Download / Retry button — only when not cached and not currently downloading */}
                {!m.cached && !isModelDownloading && !isModelPending && (
                  <button
                    className="btn btn-gold sm"
                    disabled={downloading}
                    onClick={() => setDownloadTarget(m)}
                  >
                    <Icon name={(isModelFailed || isOverallFailed) ? "refresh" : "download"} size={16} />
                    {(isModelFailed || isOverallFailed) ? t("models.retry") : t("models.downloadOne")}
                  </button>
                )}

                {m.cached && (
                  <button
                    className="btn btn-danger sm"
                    onClick={() => setDeleteTarget(m)}
                    disabled={downloading}
                  >
                    <Icon name="delete" size={16} />
                    {t("models.delete")}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal
          title={t("models.delete")}
          danger
          confirmLabel={t("common.delete")}
          onClose={() => setDeleteTarget(null)}
          onConfirm={doDelete}
        >
          <p>{t("models.deleteConfirm", { name: deleteTarget.parameters })}</p>
        </Modal>
      )}

      {/* Download confirmation */}
      {downloadTarget && (
        <Modal
          title={t("models.downloadOne")}
          confirmLabel={t("models.downloadOne")}
          onClose={() => setDownloadTarget(null)}
          onConfirm={confirmDownload}
          confirmDisabled={downloadingModel}
        >
          <p>
            {t("models.downloadOneConfirm", {
              name: downloadTarget.parameters,
              size: MODEL_SIZE_HINT[downloadTarget.id],
            })}
          </p>
        </Modal>
      )}

      {/* Storage path modal */}
      {showPathModal && (
        <Modal
          title={t("models.storagePath")}
          onClose={() => setShowPathModal(false)}
          onConfirm={() => setShowPathModal(false)}
          confirmLabel={t("common.close")}
        >
          <p className="muted" style={{ fontSize: 13, marginBottom: "var(--sp-3)" }}>
            {t("models.storagePathHint")}
          </p>
          {storagePath ? (
            <>
              <div
                style={{
                  padding: "var(--sp-3)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--overlay-bg)",
                  border: "1px solid var(--border-soft)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  wordBreak: "break-all",
                  marginBottom: "var(--sp-3)",
                }}
              >
                {storagePath.path}
              </div>
              <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                <button
                  className="btn btn-gold sm"
                  onClick={openStorageFolder}
                  disabled={!storagePath.exists}
                >
                  <Icon name="folder_open" size={16} />
                  {openFolderLabel}
                </button>
                <button className="btn btn-ghost sm" onClick={copyStoragePath}>
                  <Icon name={pathCopied ? "check" : "content_copy"} size={16} />
                  {pathCopied ? t("models.pathCopied") : t("models.copyPath")}
                </button>
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>—</div>
          )}
        </Modal>
      )}
    </div>
  );
}
