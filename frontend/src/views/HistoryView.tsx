import { useMemo, useState } from "react";
import { deleteJob } from "../api";
import { useApp } from "../store";
import { Icon } from "../icons";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, sourceIcon } from "../storage";

export function HistoryView() {
  const { t, lang, sessions, removeSessions, navigate, patchSession } = useApp();
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; value: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      (s.displayName ?? "").toLowerCase().includes(q) ||
      (s.transcriptPreview ?? "").toLowerCase().includes(q) ||
      (s.originalFilename ?? "").toLowerCase().includes(q)
    );
  }, [sessions, query]);

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function selectAll() { setSelected(new Set(filtered.map((s) => s.id))); }
  function clearSelect() { setSelected(new Set()); }
  function exitSelect() { setSelectMode(false); clearSelect(); }

  async function deleteSelected() {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => deleteJob(id).catch(() => undefined)));
    removeSessions(ids);
    exitSelect();
    setConfirmDelete(false);
  }

  async function deleteOne(id: string) {
    await deleteJob(id).catch(() => undefined);
    removeSessions([id]);
  }

  function startRename(id: string, current: string | null) {
    setRenameTarget({ id, value: current ?? "" });
  }
  function saveRename() {
    if (renameTarget) patchSession(renameTarget.id, { displayName: renameTarget.value.trim() || null });
    setRenameTarget(null);
  }

  return (
    <div className="content wide scroll">
      {/* Toolbar */}
      <section className="card pad mb-6">
        <div className="row-flex between gap-4" style={{ flexWrap: "wrap" }}>
          <div className="stack" style={{ gap: 2, flex: 1, minWidth: 220 }}>
            <span className="eyebrow">{sessions.length} {t("history.count")}</span>
            <h1 className="h1">{t("history.title")}</h1>
            <p className="faint" style={{ fontSize: 13 }}>{t("history.subtitle")}</p>
          </div>
          <div className="row-flex gap-2" style={{ flexWrap: "wrap" }}>
            <div className="row-flex gap-2" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "var(--r-sm)", padding: "0 12px" }}>
              <Icon name="search" size={18} />
              <input className="input" style={{ background: "transparent", border: "none", padding: "10px 0", minWidth: 180 }} placeholder={t("history.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {!selectMode ? (
              <button className="btn btn-ghost" onClick={() => { setSelectMode(true); }}><Icon name="check_circle" size={18} />{t("history.select")}</button>
            ) : (
              <>
                <button className="btn btn-ghost sm" onClick={selectAll}><Icon name="done_all" size={16} />{t("history.selectAll")}</button>
                <button className="btn btn-danger sm" disabled={selected.size === 0} onClick={() => setConfirmDelete(true)}><Icon name="delete" size={16} />{t("history.deleteSelected")} ({selected.size})</button>
                <button className="btn btn-ghost sm" onClick={exitSelect}>{t("history.exitSelect")}</button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="empty">
          <Icon name="history" size={48} />
          <h2 className="h2">{query ? t("history.empty") : t("history.empty")}</h2>
          <p className="faint">{t("history.emptyHint")}</p>
          <button className="btn btn-gold mt-2" onClick={() => navigate("home")}>{t("session.new")}</button>
        </div>
      ) : (
        <div className="list">
          {filtered.map((s) => {
            const isSelected = selected.has(s.id);
            const defaultName = `${t("nav.session")} ${s.id.slice(-4)}`;
            return (
              <div key={s.id} className={`row ${isSelected ? "selected" : ""}`} onClick={() => selectMode ? toggleSelect(s.id) : navigate("session", s.id)}>
                {selectMode ? (
                  <span className="row-icon" style={{ background: isSelected ? "rgba(230,202,101,0.2)" : "rgba(255,255,255,0.04)" }}>
                    <Icon name={isSelected ? "check_circle" : "radio_button_unchecked"} size={20} fill={isSelected} />
                  </span>
                ) : (
                  <span className="row-icon"><Icon name={sourceIcon(s.sourceType)} size={18} /></span>
                )}
                <div className="row-body">
                  <div className="row-title">{s.displayName ?? defaultName}</div>
                  <div className="row-preview">{s.transcriptPreview ?? s.originalFilename ?? "—"}</div>
                </div>
                <div className="row-meta">
                  <StatusBadge status={s.status} />
                  <span>{formatDate(s.createdAt, lang)}</span>
                  {s.durationMs ? <span>{Math.round(s.durationMs / 1000)}{t("common.sec")}</span> : null}
                </div>
                {!selectMode && (
                  <div className="row-actions">
                    <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={(e) => { e.stopPropagation(); startRename(s.id, s.displayName); }} title={t("session.rename")}><Icon name="edit" size={16} /></button>
                    <button className="icon-btn danger" style={{ width: 32, height: 32 }} onClick={(e) => { e.stopPropagation(); deleteOne(s.id); }} title={t("session.delete")}><Icon name="delete" size={16} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <Modal title={t("history.deleteSelected")} danger confirmLabel={t("common.delete")} onClose={() => setConfirmDelete(false)} onConfirm={deleteSelected}>
          <p>{selected.size} {t("history.selected")}. {t("session.deleteConfirm")}</p>
        </Modal>
      )}

      {renameTarget && (
        <Modal title={t("session.rename")} confirmLabel={t("common.save")} onClose={() => setRenameTarget(null)} onConfirm={saveRename}>
          <input className="input" autoFocus value={renameTarget.value} onChange={(e) => setRenameTarget({ ...renameTarget, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveRename(); }} placeholder={t("session.name")} />
        </Modal>
      )}
    </div>
  );
}
