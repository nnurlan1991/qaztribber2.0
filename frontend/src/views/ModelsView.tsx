import { useState } from "react";
import { deleteModel, startPreload } from "../api";
import { useApp } from "../store";
import { Icon } from "../icons";
import { Modal } from "../components/Modal";
import { ProgressBar } from "../components/ProgressBar";
import { formatBytes, type SessionStatus } from "../storage";
import { StatusBadge } from "../components/StatusBadge";

export function ModelsView() {
  const { t, models, preload, prefs, setPrefs, refreshModels, refreshPreload, setError } = useApp();
  const downloading = preload?.status === "downloading";
  const allCached = models.length > 0 && models.every((m) => m.cached);
  const totalSize = models.filter((m) => m.cached).reduce((acc, m) => acc + m.size_bytes, 0);
  const [deleteTarget, setDeleteTarget] = useState<typeof models[number] | null>(null);

  async function startDownload() {
    try { setError(null); await startPreload(); await refreshPreload(); } catch (reason) { setError(reason instanceof Error ? reason.message : t("error.preload")); }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try { setError(null); await deleteModel(deleteTarget.id); await refreshModels(); await refreshPreload(); } catch (reason) { setError(reason instanceof Error ? reason.message : t("error.modelDelete")); }
    setDeleteTarget(null);
  }

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
            <div className="stat"><div className="stat-num">{models.filter((m) => m.cached).length}/{models.length}</div><div className="stat-label">{t("models.cached")}</div></div>
            <div className="stat"><div className="stat-num">{totalSize ? formatBytes(totalSize) : "—"}</div><div className="stat-label">{t("models.storage")}</div></div>
          </div>
        </div>
        <div className="mt-6">
          {allCached ? (
            <div className="notice info"><Icon name="cloud_done" size={20} /><span>{t("models.ready")}</span></div>
          ) : (
            <div className="stack gap-3">
              <div className="row-flex between gap-4" style={{ flexWrap: "wrap" }}>
                <div className="row-flex gap-3">
                  <Icon name="cloud_download" size={22} />
                  <div className="stack" style={{ gap: 2 }}>
                    <strong>{t("models.downloadAll")}</strong>
                    <span className="faint" style={{ fontSize: 12 }}>{preload?.stage ?? ""}</span>
                  </div>
                </div>
                <button className="btn btn-gold" disabled={downloading} onClick={startDownload}>
                  {downloading ? <><Icon name="autorenew" size={18} />{t("models.downloading")}</> : <><Icon name="download" size={18} />{t("models.downloadAll")}</>}
                </button>
              </div>
              {downloading && preload && <ProgressBar value={preload.progress} showLabel />}
            </div>
          )}
        </div>
      </section>

      {/* Model cards */}
      <div className="model-grid">
        {models.map((m) => {
          const isSelected = prefs.defaultModel === m.id;
          const status: SessionStatus = m.cached ? "completed" : "queued";
          return (
            <article key={m.id} className={`model-card ${isSelected ? "selected" : ""}`}>
              <div className="row-flex between">
                <span className="model-num">{m.parameters}</span>
                <StatusBadge status={status} />
              </div>
              <h2 className="h2 mt-2">{m.id === "220m" ? t("models.small") : t("models.large")}</h2>
              <p className="faint mt-2" style={{ fontSize: 13 }}>{m.id === "220m" ? t("models.smallDesc") : t("models.largeDesc")}</p>
              <div className="divider" />
              <div className="stack gap-2">
                <div className="row-flex between"><span className="meta-key">{t("models.parameters")}</span><span className="mono">{m.parameters}</span></div>
                <div className="row-flex between"><span className="meta-key">{t("models.storage")}</span><span className="mono">{m.cached ? formatBytes(m.size_bytes) : "—"}</span></div>
                <div className="row-flex between"><span className="meta-key">{t("session.status")}</span><span className="faint" style={{ fontSize: 12 }}>{m.cached ? t("models.cached") : t("models.notCached")}</span></div>
              </div>
              <div className="row-flex gap-2 mt-4">
                <button className={`btn sm ${isSelected ? "btn-soft" : "btn-ghost"}`} disabled={isSelected} onClick={() => setPrefs({ defaultModel: m.id })}>
                  <Icon name={isSelected ? "check" : "radio_button_unchecked"} size={16} fill={isSelected} />
                  {isSelected ? t("models.selected") : t("models.select")}
                </button>
                {m.cached && <button className="btn btn-danger sm" onClick={() => setDeleteTarget(m)} disabled={downloading}><Icon name="delete" size={16} />{t("models.delete")}</button>}
              </div>
            </article>
          );
        })}
      </div>

      {deleteTarget && (
        <Modal title={t("models.delete")} danger confirmLabel={t("common.delete")} onClose={() => setDeleteTarget(null)} onConfirm={doDelete}>
          <p>{t("models.deleteConfirm", { name: deleteTarget.parameters })}</p>
        </Modal>
      )}
    </div>
  );
}
