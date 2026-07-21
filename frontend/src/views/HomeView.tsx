import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { cancelJob, createJob, deleteJob, getResult, pauseJob, resumeJob, startPreload, watchJob, saveAndOpenTxt } from "../api";
import { jobToSession, useApp } from "../store";
import { Icon } from "../icons";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import { ModelDownloadDialog } from "../components/ModelDownloadDialog";
import { ModelLoadWarning } from "../components/ModelLoadWarning";
import { formatTime, sourceIcon, type SourceType } from "../storage";
import { notifyJobComplete, requestNotificationPermission } from "../notifications";
import type { Job, Model } from "../api";

const terminalStatuses = new Set<Job["status"]>(["completed", "failed", "cancelled"]);

export function HomeView() {
  const { t, models, preload, prefs, sessions, upsertSession, patchSession, navigate, setError, error, systemInfo, pendingRerun, setPendingRerun } = useApp();

  const [selectedModel, setSelectedModel] = useState<Model["id"]>(prefs.defaultModel);
  const [expectedLanguage, setExpectedLanguage] = useState<Job["expected_language"]>("mixed");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [sourceType, setSourceType] = useState<SourceType>("file");
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<{ id: string; text: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [pendingRun, setPendingRun] = useState(false);
  const pendingModel = useRef<Model["id"] | null>(null);
  const [showModelLoadWarning, setShowModelLoadWarning] = useState(false);
  const cancelRequestedRef = useRef(false);
  const notifiedJobs = useRef<Set<string>>(new Set());

  // Sync from TopBar model toggle
  useEffect(() => { setSelectedModel(prefs.defaultModel); }, [prefs.defaultModel]);

  useEffect(() => {
    if (!job || terminalStatuses.has(job.status)) return;
    return watchJob(
      job.id,
      (next) => {
        if ((next.status === "completed" || next.status === "failed") && !notifiedJobs.current.has(next.id)) {
          notifiedJobs.current.add(next.id);
          notifyJobComplete(
            next.id, next.status,
            next.status === "completed" ? t("notif.completedTitle") : t("notif.failedTitle"),
            next.status === "completed" ? t("notif.completedBody") : t("notif.failedBody"),
          );
        }
        setJob(next);
        patchSession(next.id, { status: next.status, progress: next.progress, stage: next.stage, errorMessage: next.error });
      },
      () => setError(t("error.stream"))
    );
  }, [job?.id, job?.status, patchSession, setError, t]);

  useEffect(() => {
    if (job?.status !== "completed") return;
    getResult(job.id)
      .then((r) => {
        setResult({ id: r.id, text: r.text });
        patchSession(job.id, {
          status: "completed",
          transcript: r.text,
          transcriptPreview: r.text.slice(0, 120),
          durationMs: r.duration_seconds != null ? Math.round(r.duration_seconds * 1000) : null,
        });
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : t("error.transcribe")));
  }, [job?.status, job?.id, patchSession, setError, t]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // Handle pending rerun (from SessionView "Заново" button)
  useEffect(() => {
    if (!pendingRerun) return;
    // Apply the pending file + settings
    const { file: rerunFile, model, expectedLanguage: lang, sourceType: stype, originalFilename } = pendingRerun;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(rerunFile);
    setAudioUrl(URL.createObjectURL(rerunFile));
    setDuration(0);
    setJob(null);
    setResult(null);
    setError(null);
    cancelRequestedRef.current = false;
    setSourceType(stype);
    setSelectedModel(model as Model["id"]);
    setExpectedLanguage(lang as Job["expected_language"]);
    // Clear the pending state so it doesn't re-trigger
    setPendingRerun(null);
  }, [pendingRerun, audioUrl, setPendingRerun, setError]);

  useEffect(() => {
    if (!recording) {
      if (recTimer.current) { window.clearInterval(recTimer.current); recTimer.current = null; }
      setRecElapsed(0);
    } else {
      recTimer.current = window.setInterval(() => setRecElapsed((e) => e + 1), 1000);
    }
    return () => { if (recTimer.current) window.clearInterval(recTimer.current); };
  }, [recording]);

  // Auto-run transcription when preload completes for pending transcription
  useEffect(() => {
    if (preload?.status === "completed" && pendingRun && file && pendingModel.current) {
      setPendingRun(false);
      setSelectedModel(pendingModel.current);
      // Use setTimeout to avoid setState-during-render issues;
      // pass pendingModel.current explicitly to avoid stale closure over selectedModel
      window.setTimeout(() => run(pendingModel.current ?? undefined), 0);
    }
  }, [preload?.status, pendingRun, file]);

  function selectFile(nextFile: File, source: SourceType = "file") {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(nextFile);
    setAudioUrl(URL.createObjectURL(nextFile));
    setDuration(0);
    setJob(null); setResult(null); setError(null); cancelRequestedRef.current = false;
    setSourceType(source);
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    if (next) selectFile(next, "file");
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault(); setDragging(false);
    const next = e.dataTransfer.files[0];
    if (next) selectFile(next, "file");
  }

  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunks.current = [];
      mediaRecorder.ondataavailable = (e) => chunks.current.push(e.data);
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || "audio/webm" });
        selectFile(new File([blob], `recording-${Date.now()}.webm`, { type: blob.type }), "mic");
        setRecording(false);
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch {
      setError(t("error.mic"));
    }
  }

  async function run(modelOverride?: Model["id"]) {
    if (!file) return;

    // Request notification permission early so user sees prompt while at the app
    requestNotificationPermission().catch(() => {});

    const modelId = modelOverride ?? selectedModel;

    const selectedModelObj = models.find((m) => m.id === modelId);
    if (selectedModelObj && !selectedModelObj.cached) {
      setShowModelDialog(true);
      setPendingRun(true);
      return;
    }

    setError(null); setResult(null);
    try {
      const created = await createJob(file, modelId, expectedLanguage, 0, duration);
      setJob(created);
      upsertSession(jobToSession(created, {
        sourceType,
        originalFilename: sourceType === "mic" ? null : file.name,
        durationMs: duration ? Math.round(duration * 1000) : null,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.create"));
    }
  }

  async function cancel() {
    if (!job) return;
    // During model_load stage, show warning instead of immediate cancel
    if (job.status === "loading_model") {
      setShowModelLoadWarning(true);
      cancelRequestedRef.current = true;
      try {
        await cancelJob(job.id);
      } catch (reason) {
        cancelRequestedRef.current = false;
        setShowModelLoadWarning(false);
        setError(reason instanceof Error ? reason.message : t("error.cancel"));
      }
      return;
    }
    try { setJob(await cancelJob(job.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : t("error.cancel")); }
  }

  async function handlePause() {
    if (!job) return;
    try { setJob(await pauseJob(job.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : t("error.cancel")); }
  }

  async function handleResume() {
    if (!job) return;
    try { setJob(await resumeJob(job.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : t("error.cancel")); }
  }

  async function reset() {
    if (job) await deleteJob(job.id).catch(() => undefined);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(null); setAudioUrl(null); setDuration(0);
    setJob(null); setResult(null); setError(null);
    cancelRequestedRef.current = false;
  }

  async function copyText() {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleDownloadTxt() {
    if (!result) return;
    const baseName = (file?.name || result.id.slice(-8)).replace(/\.[^.]+$/, "");
    await saveAndOpenTxt(result.text, baseName);
  }

  async function handleDownloadForTranscribe(modelId: Model["id"]) {
    setShowModelDialog(false);
    pendingModel.current = modelId;
    try {
      setError(null);
      await startPreload([modelId]);
    } catch (reason) {
      setPendingRun(false);
      setError(reason instanceof Error ? reason.message : t("error.preload"));
    }
  }

  const selected = useMemo(() => models.find((m) => m.id === selectedModel), [models, selectedModel]);
  const busy = job !== null && !terminalStatuses.has(job.status);
  const canRun = !!file && !busy && !recording;

  // ETA: estimated processing time based on audio duration × device speed multiplier
  const etaSeconds = useMemo(() => {
    if (!duration || !systemInfo) return 0;
    const multiplier = selectedModel === "220m" ? systemInfo.speed_multiplier_220m : systemInfo.speed_multiplier_600m;
    return Math.ceil(duration * multiplier);
  }, [duration, systemInfo, selectedModel]);
  const etaText = etaSeconds > 0;

  // Active sessions from store (excluding the current job shown in HomeView)
  const activeSessions = sessions.filter(
    (s) => ["queued", "preparing", "loading_model", "transcribing", "paused"].includes(s.status) && s.id !== job?.id
  );

  return (
    <div className="content home">
      {/* Active sessions bar */}
      {activeSessions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
          {activeSessions.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate("session", s.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-3)",
                padding: "var(--sp-3) var(--sp-4)",
                borderRadius: "var(--r-md)",
                background: "var(--overlay-bg)",
                border: "1px solid var(--border-soft)",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--gold-shimmer)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-soft)"; }}
            >
              <Icon name="autorenew" size={18} style={{ animation: "qzt-spin 1.5s linear infinite", color: "var(--gold-shimmer)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.originalFilename || s.id.slice(-8)}
                </div>
                <div style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
                  {s.modelUsed.toUpperCase()} · {s.status === "paused" ? t("status.paused") : t("home.processing")}
                </div>
              </div>
              <div style={{ width: 80 }}>
                <ProgressBar value={s.progress || 0} />
              </div>
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--gold-shimmer)", minWidth: 36, textAlign: "right" }}>
                {Math.round((s.progress || 0) * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Compact hero: title | record | language | transcribe */}
      <section className="card home-hero-compact gold-edge">
        {/* ЗОНА A: только заголовок */}
        <div className="hero-zone hero-zone-a">
          <div className="hero-text">
            <h1>{t("home.title")}</h1>
            <div className="sub">{t("home.subtitle")}</div>
          </div>
        </div>

        {/* ЗОНА R: кнопка записи (отдельно от заголовка) */}
        <div className="hero-zone hero-zone-r">
          <div className="home-rec-cluster">
            <button className={`rec-btn ${recording ? "recording" : ""}`} disabled={busy} onClick={toggleRecording} aria-label={recording ? "Stop" : "Record"}>
              <Icon name={recording ? "stop" : "mic"} fill size={26} />
            </button>
            <div className="stack" style={{ gap: 1 }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: recording ? "var(--status-rec)" : "var(--gold-shimmer)" }}>
                {recording ? t("home.recording") : t("home.record")}
              </span>
              <span className={`rec-timer-text ${recording ? "live" : ""}`}>
                {recording ? formatTime(recElapsed) : "00:00"}
              </span>
            </div>
          </div>
        </div>

        {/* ЗОНА B: язык записи */}
        <div className="hero-zone hero-zone-b">
          <div className="toolbar-row">
            <span className="eyebrow" style={{ marginRight: 2 }}>{t("home.language")}</span>
            <div className="segmented">
              <button className={expectedLanguage === "kazakh" ? "active" : ""} onClick={() => setExpectedLanguage("kazakh")} disabled={busy}>{t("lang.kazakh")}</button>
              <button className={expectedLanguage === "russian" ? "active" : ""} onClick={() => setExpectedLanguage("russian")} disabled={busy}>{t("lang.russian")}</button>
              <button className={expectedLanguage === "mixed" ? "active" : ""} onClick={() => setExpectedLanguage("mixed")} disabled={busy}>{t("lang.mixed")}</button>
            </div>
          </div>
        </div>

        {/* ЗОНА C: расшифровать */}
        <div className="hero-zone hero-zone-c">
          <div className="toolbar-row">
            {busy && (job?.status === "loading_model" && cancelRequestedRef.current ? (
              <button className="btn btn-danger" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}><Icon name="autorenew" size={16} />{t("home.cancellingAfterLoad")}</button>
            ) : (
              <button className="btn btn-danger" onClick={cancel}><Icon name="cancel" size={16} />{t("home.cancel")}</button>
            ))}
            <button className="btn btn-gold" disabled={!canRun} onClick={() => run()}>
              <Icon name="bolt" size={16} fill />
              {busy ? t("home.transcribing") : `${t("home.transcribe")} · ${selected?.parameters ?? "…"}`}
            </button>
          </div>
        </div>
      </section>

      {error && <div className="notice error"><Icon name="error" size={18} /><span style={{ flex: 1 }}>{error}</span><button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setError(null)}><Icon name="close" size={16} /></button></div>}

      {/* Main grid: audio source | transcript */}
      <div className="home-grid">
        {/* Left: audio source + player */}
        <section className="card pad home-col-stack">
          <div className="row-flex between" style={{ flex: "0 0 auto" }}>
            <h2 className="h3">{t("home.audio")}</h2>
            <span className="mono faint" style={{ fontSize: 11 }}>{file ? t("home.ready") : t("home.waiting")}</span>
          </div>

          {!file ? (
            <label className={`dropzone ${dragging ? "dragging" : ""}`} style={{ flex: 1, minHeight: 0 }} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
              <input ref={fileInput} type="file" accept=".wav,.mp3,.m4a,.flac,.ogg,.webm,audio/*" onChange={onFileInput} />
              <span className="dz-icon"><Icon name="cloud_download" size={24} /></span>
              <strong style={{ fontSize: 16 }}>{t("home.drop")}</strong>
              <span className="faint" style={{ fontSize: 11 }}>{t("home.dropHint")}</span>
              <span className="gold-text" style={{ fontSize: 12, fontWeight: 700 }}>{t("home.browse")}</span>
            </label>
          ) : (
            <div className="stack gap-3" style={{ flex: 1, minHeight: 0 }}>
              <div className="row-flex between gap-3 min-w-0" style={{ flex: "0 0 auto" }}>
                <div className="row-flex gap-2 min-w-0">
                  <span className="row-icon" style={{ width: 32, height: 32, flex: "0 0 auto" }}><Icon name={sourceIcon(sourceType)} size={16} /></span>
                  <div className="min-w-0">
                    <div className="row-title" style={{ fontSize: 13 }}>{file.name}</div>
                    <div className="mono faint" style={{ fontSize: 10 }}>{sourceType === "mic" ? t("source.mic") : t("source.file")}</div>
                  </div>
                </div>
                <button className="icon-btn" style={{ width: 30, height: 30 }} disabled={busy} onClick={reset} title={t("home.replace")}><Icon name="close" size={16} /></button>
              </div>

              {audioUrl && (
                <audio controls src={audioUrl} onLoadedMetadata={(e) => { const v = e.currentTarget.duration; if (Number.isFinite(v) && v > 0) setDuration(v); }} style={{ width: "100%", height: 34, flex: "0 0 auto" }} />
              )}

              {/* Duration + ETA indicator */}
              {duration > 0 && (
                <div className="audio-duration-bar" style={{ flex: "0 0 auto" }}>
                  <Icon name="schedule" size={16} />
                  <span className="time strong">{formatTime(duration)}</span>
                  {etaText && (
                    <>
                      <span className="time" style={{ color: "var(--gold-shimmer)" }}>~{formatTime(etaSeconds)}</span>
                      <Icon name="bolt" size={14} />
                    </>
                  )}
                  <div className="progress thin" style={{ flex: 1 }}><i style={{ width: "100%" }} /></div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: transcript result (main block) */}
        <section className="card pad home-col-stack">
          <div className="row-flex between" style={{ flex: "0 0 auto" }}>
            <h2 className="h3">{t("home.text")}</h2>
            {job ? <StatusBadge status={job.status} /> : <span className="mono faint" style={{ fontSize: 11 }}>{t("home.waiting")}</span>}
          </div>

          {job && !terminalStatuses.has(job.status) && (
            <div className="transcribe-progress" style={{ flex: "0 0 auto" }}>
              <div className="row-flex between mb-2">
                <span className="mono" style={{ fontSize: 11, color: "var(--gold-shimmer)" }}>{job.stage}</span>
                <span className="mono gold-text" style={{ fontSize: 22, fontWeight: 800 }}>{Math.round(job.progress * 100)}%</span>
              </div>
              <ProgressBar value={job.progress} className="lg" />
              <div className="row-flex gap-2" style={{ marginTop: "var(--sp-2)" }}>
                {job.status === "transcribing" && (
                  <button className="btn btn-soft sm" onClick={handlePause}>
                    <Icon name="pause" size={16} />{t("home.pause")}
                  </button>
                )}
                {job.status === "paused" && (
                  <button className="btn btn-gold sm" onClick={handleResume}>
                    <Icon name="play_arrow" size={16} />{t("home.resume")}
                  </button>
                )}
              </div>
            </div>
          )}
          {job?.status === "failed" && <div className="notice error" style={{ flex: "0 0 auto" }}><Icon name="error" size={16} /><span>{job.error || t("error.transcribe")}</span></div>}
          {job?.status === "cancelled" && <div className="notice info" style={{ flex: "0 0 auto" }}><Icon name="info" size={16} /><span>{t("error.cancelled")}</span></div>}

          <textarea
            className="transcript home-transcript"
            value={result?.text ?? ""}
            onChange={(e) => setResult((prev) => prev ? { ...prev, text: e.target.value } : prev)}
            placeholder={t("session.placeholder")}
            disabled={!result}
          />

          {result && (
            <div className="result-actions-row">
              <button className="btn btn-soft sm" onClick={copyText}><Icon name={copied ? "check" : "content_copy"} size={14} />{copied ? t("session.copied") : t("session.copy")}</button>
              <button className="btn btn-ghost sm" onClick={handleDownloadTxt}><Icon name="download" size={14} />{t("session.download")}</button>
              <button className="btn btn-link sm" onClick={() => navigate("session", result.id)}>{t("session.metadata")} <Icon name="chevron_right" size={14} /></button>
              <button className="btn btn-link sm" onClick={reset} style={{ marginLeft: "auto" }}>{t("session.new")}</button>
            </div>
          )}
        </section>
      </div>

      {showModelDialog && (
        <ModelDownloadDialog
          modelName={selected?.parameters ?? selectedModel}
          onDownload={handleDownloadForTranscribe}
          onCancel={() => { setShowModelDialog(false); setPendingRun(false); }}
        />
      )}

      {showModelLoadWarning && (
        <ModelLoadWarning
          onClose={() => setShowModelLoadWarning(false)}
          estimatedSeconds={30}
        />
      )}
    </div>
  );
}
