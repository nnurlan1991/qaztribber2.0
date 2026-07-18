import { useState } from "react";
import { deleteJob, getResult } from "../api";
import { useApp } from "../store";
import { Icon } from "../icons";
import { Modal } from "../components/Modal";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import { Waveform } from "../components/Waveform";
import { formatDate, formatTime, sourceIcon } from "../storage";

export function SessionView() {
  const { t, lang, currentSessionId, sessions, patchSession, removeSessions, navigate } = useApp();
  const session = sessions.find((s) => s.id === currentSessionId) ?? null;
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load transcript: prefer local, else fetch from API
  if (session && text === null && session.transcript) {
    setText(session.transcript);
  }

  if (!session) {
    return (
      <div className="content narrow scroll">
        <div className="empty">
          <Icon name="audio_file" size={48} />
          <h2 className="h2">{t("session.empty")}</h2>
          <button className="btn btn-gold mt-2" onClick={() => navigate("home")}>{t("session.new")}</button>
        </div>
      </div>
    );
  }

  const defaultName = `${t("nav.session")} ${session.id.slice(-4)}`;
  const display = session.displayName ?? defaultName;
  const isActive = ["queued", "preparing", "loading_model", "transcribing"].includes(session.status);

  async function copyText() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function refreshFromApi() {
    if (!session) return;
    try {
      const r = await getResult(session.id);
      setText(r.text);
      patchSession(session.id, { status: "completed", transcript: r.text, transcriptPreview: r.text.slice(0, 120), durationMs: r.duration_seconds != null ? Math.round(r.duration_seconds * 1000) : null });
    } catch { /* job may be gone after backend restart */ }
  }

  function startRename() {
    setNameDraft(session?.displayName ?? "");
    setEditing(true);
  }

  function saveRename() {
    if (session) patchSession(session.id, { displayName: nameDraft.trim() || null });
    setEditing(false);
  }

  async function doDelete() {
    if (!session) return;
    try { await deleteJob(session.id).catch(() => undefined); } catch { /* ignore */ }
    removeSessions([session.id]);
    setConfirmDelete(false);
    navigate("history");
  }

  return (
    <div className="content narrow scroll">
      {/* Header card */}
      <section className="card pad mb-6">
        <div className="row-flex between gap-4 mb-4">
          <div className="row-flex gap-3 min-w-0">
            <button className="icon-btn" onClick={() => navigate("history")}><Icon name="arrow_back" size={20} /></button>
            <span className="row-icon"><Icon name={sourceIcon(session.sourceType)} size={20} /></span>
            <div className="min-w-0">
              {editing ? (
                <input className="input" autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(false); }} style={{ maxWidth: 360 }} />
              ) : (
                <h1 className="h1" style={{ cursor: "pointer" }} onClick={startRename} title={t("session.rename")}>{display}</h1>
              )}
              <div className="row-flex gap-3 mt-2"><StatusBadge status={session.status} /><span className="mono faint" style={{ fontSize: 11 }}>{formatDate(session.createdAt, lang)}</span></div>
            </div>
          </div>
          <div className="row-flex gap-1">
            <button className="icon-btn" onClick={startRename} title={t("session.rename")}><Icon name="edit" size={20} /></button>
            <button className="icon-btn" onClick={() => refreshFromApi()} title={t("common.retry")}><Icon name="refresh" size={20} /></button>
            <button className="icon-btn danger" onClick={() => setConfirmDelete(true)} title={t("session.delete")}><Icon name="delete" size={20} /></button>
          </div>
        </div>
        {editing && (
          <div className="row-flex gap-2 mt-2">
            <button className="btn btn-gold sm" onClick={saveRename}><Icon name="check" size={16} />{t("common.save")}</button>
            <button className="btn btn-ghost sm" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
          </div>
        )}
      </section>

      {/* Active progress */}
      {isActive && (
        <section className="card pad mb-6 gold-edge">
          <div className="row-flex between mb-3">
            <div className="row-flex gap-3"><Icon name="autorenew" size={20} /><strong>{session.stage}</strong></div>
            <span className="mono faint">{Math.round(session.progress * 100)}%</span>
          </div>
          <ProgressBar value={session.progress} />
        </section>
      )}

      {/* Metadata + waveform */}
      <section className="card pad mb-6">
        <div className="row-flex between mb-4"><h2 className="h3">{t("session.metadata")}</h2></div>
        <div className="meta-grid">
          <div className="meta-row"><span className="meta-key">{t("session.date")}</span><span className="meta-val">{formatDate(session.createdAt, lang)}</span></div>
          <div className="meta-row"><span className="meta-key">{t("session.duration")}</span><span className="meta-val">{session.durationMs ? formatTime(session.durationMs / 1000) : "—"}</span></div>
          <div className="meta-row"><span className="meta-key">{t("session.source")}</span><span className="meta-val">{t(`source.${session.sourceType}`)}</span></div>
          <div className="meta-row"><span className="meta-key">{t("session.model")}</span><span className="meta-val">{session.modelUsed.toUpperCase()}</span></div>
          <div className="meta-row"><span className="meta-key">{t("home.language")}</span><span className="meta-val">{t(`lang.${session.expectedLanguage}`)}</span></div>
          <div className="meta-row"><span className="meta-key">{t("session.status")}</span><StatusBadge status={session.status} /></div>
        </div>
        {session.durationMs && (
          <div className="mt-4">
            <Waveform count={56} seed={session.id.charCodeAt(0) + session.id.length} height={36} progress={0} />
          </div>
        )}
      </section>

      {/* Transcript */}
      <section className="card pad mb-6">
        <div className="row-flex between mb-4">
          <h2 className="h3">{t("session.transcript")}</h2>
          <div className="row-flex gap-2">
            <button className="btn btn-soft sm" onClick={copyText} disabled={!text}><Icon name={copied ? "check" : "content_copy"} size={16} />{copied ? t("session.copied") : t("session.copy")}</button>
            {text && <a className="btn btn-ghost sm" href={`/api/transcriptions/${session.id}/result.txt`} download><Icon name="download" size={16} />{t("session.download")}</a>}
          </div>
        </div>
        <textarea
          className="transcript"
          value={text ?? ""}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== null && patchSession(session.id, { transcript: text, transcriptPreview: text.slice(0, 120) })}
          placeholder={t("session.placeholder")}
          style={{ minHeight: 320 }}
        />
        {session.errorMessage && <div className="notice error mt-4"><Icon name="error" size={18} /><span>{session.errorMessage}</span></div>}
      </section>

      {confirmDelete && (
        <Modal title={t("session.delete")} danger confirmLabel={t("common.delete")} onClose={() => setConfirmDelete(false)} onConfirm={doDelete}>
          <p>{t("session.deleteConfirm")}</p>
        </Modal>
      )}
    </div>
  );
}
