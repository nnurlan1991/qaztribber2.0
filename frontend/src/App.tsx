import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { cancelJob, createJob, deleteJob, getModels, getPreload, getResult, Model, Preload, Result, Job, startPreload, watchJob } from "./api";

const SUPPORTED = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/flac", "audio/webm"];
const terminalStatuses = new Set<Job["status"]>(["completed", "failed", "cancelled"]);

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export default function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model["id"]>("220m");
  const [expectedLanguage, setExpectedLanguage] = useState<Job["expected_language"]>("mixed");
  const [preload, setPreload] = useState<Preload | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    getModels().then(setModels).catch((reason) => setError(`Не удалось соединиться с API: ${reason.message}`));
    getPreload().then(setPreload).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (preload?.status !== "downloading") return;
    const timer = window.setInterval(() => getPreload().then(setPreload).catch((reason) => setError(reason.message)), 1200);
    return () => window.clearInterval(timer);
  }, [preload?.status]);

  useEffect(() => {
    if (!job || terminalStatuses.has(job.status)) return;
    return watchJob(
      job.id,
      (next) => setJob(next),
      () => setError("Поток статуса прервался. Проверьте, что локальный API запущен.")
    );
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (job?.status === "completed") getResult(job.id).then(setResult).catch((reason) => setError(reason.message));
  }, [job?.status, job?.id]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const selected = useMemo(() => models.find((model) => model.id === selectedModel), [models, selectedModel]);
  const busy = job !== null && !terminalStatuses.has(job.status);

  function selectFile(nextFile: File) {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(nextFile);
    setAudioUrl(URL.createObjectURL(nextFile));
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setJob(null);
    setResult(null);
    setError(null);
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (next) selectFile(next);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const next = event.dataTransfer.files[0];
    if (next) selectFile(next);
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => chunks.current.push(event.data);
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || "audio/webm" });
        selectFile(new File([blob], `recording-${Date.now()}.webm`, { type: blob.type }));
        setRecording(false);
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch {
      setError("Браузер не дал доступ к микрофону. Разрешите доступ и повторите попытку.");
    }
  }

  async function run() {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const created = await createJob(file, selectedModel, expectedLanguage, trimStart, trimEnd || duration);
      setJob(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать задачу.");
    }
  }

  async function cancel() {
    if (!job) return;
    try { setJob(await cancelJob(job.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отменить задачу."); }
  }

  async function reset() {
    if (job) await deleteJob(job.id).catch(() => undefined);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(null); setAudioUrl(null); setDuration(0); setTrimStart(0); setTrimEnd(0); setJob(null); setResult(null); setError(null);
  }

  async function copyText() {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
  }

  async function preloadModels() {
    try {
      setError(null);
      setPreload(await startPreload());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось начать загрузку моделей.");
    }
  }

  return (
    <main className="shell">
      <header className="masthead">
        <nav className="top-nav"><b>Qaztriber</b><em>● ЛОКАЛЬНО</em></nav>
        <div className="hero-copy">
          <h1 className="meeting-title">АДЕКВАТНЫЙ<br /><span>ТРАНСКРИБАТОР</span><br />СОВЕЩАНИЙ</h1>
          <p>KZ / RU / MIXED · ВАШ MAC</p>
          <div className="hero-flags"><b>GigaAM</b><span>220M / 600M</span></div>
        </div>
        <div className="sonic-object" aria-hidden="true"><i /><i /><i /><b>●<br />●<br />●</b></div>
        <div className="hero-stat"><strong>100%</strong><span>OFFLINE</span></div>
      </header>

      <section className="offline-card">
        <div><span className="eyebrow">OFFLINE READY</span><strong>Обе модели на Mac</strong><p>Загрузите один раз — работайте без интернета.</p></div>
        <div className="preload-actions"><button className="preload-button" disabled={preload?.status === "downloading" || preload?.status === "completed"} onClick={preloadModels}>{preload?.status === "completed" ? "✓ Модели готовы офлайн" : preload?.status === "downloading" ? "Загрузка…" : "Скачать обе модели"}</button>{preload && <small>{preload.stage}</small>}{preload?.status === "downloading" && <div className="mini-progress"><i style={{ width: `${Math.round(preload.progress * 100)}%` }} /></div>}</div>
      </section>

      {error && <div className="notice error">{error}<button onClick={() => setError(null)}>×</button></div>}

      <section className="workspace">
        <div className="step-head"><span>01</span><h2>Аудио</h2><em>{file ? "готово" : "ожидает"}</em></div>
        {!file ? (
          <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <input type="file" accept=".wav,.mp3,.m4a,.flac,.ogg,.webm,audio/*" onChange={onFileInput} />
            <b>Перетащите аудио сюда</b><small>WAV · MP3 · M4A · FLAC · OGG</small>
            <span>или выберите файл</span>
          </label>
        ) : (
          <div className="audio-card">
            <div className="file-line"><strong>{file.name}</strong><button className="text-button" disabled={busy} onClick={reset}>Заменить</button></div>
            {audioUrl && <audio controls src={audioUrl} onLoadedMetadata={(event) => { const value = event.currentTarget.duration; setDuration(value); setTrimEnd(value); }} />}
            {duration > 0 && <div className="trim"><div><label>Начало <b>{formatTime(trimStart)}</b></label><input type="range" min="0" max={Math.max(0, trimEnd - 0.1)} step="0.1" value={trimStart} onChange={(event) => setTrimStart(Number(event.target.value))} /></div><div><label>Конец <b>{formatTime(trimEnd)}</b></label><input type="range" min={Math.min(duration, trimStart + 0.1)} max={duration} step="0.1" value={trimEnd} onChange={(event) => setTrimEnd(Number(event.target.value))} /></div></div>}
          </div>
        )}
        <button className={recording ? "recording" : "record"} disabled={busy} onClick={toggleRecording}>{recording ? "■ Остановить запись" : "● Записать с микрофона"}</button>

        <div className="step-head"><span>02</span><h2>Модель</h2><em>{selected?.parameters ?? "загрузка"}</em></div>
        <div className="models">{models.map((model) => <button key={model.id} className={`model ${selectedModel === model.id ? "selected" : ""}`} onClick={() => setSelectedModel(model.id)} disabled={busy}><span className="model-number">{model.parameters}</span><strong>{model.title}</strong><small>{model.description}</small><footer>{model.cached ? "✓ уже на диске" : "↓ загрузится при первом запуске"}</footer></button>)}</div>
        <div className="language"><div><span className="eyebrow">ЯЗЫК ЗАПИСИ</span><strong>KZ / RU / MIXED</strong></div><div className="language-options"><button className={expectedLanguage === "kazakh" ? "active" : ""} onClick={() => setExpectedLanguage("kazakh")} disabled={busy}>Қазақша</button><button className={expectedLanguage === "russian" ? "active" : ""} onClick={() => setExpectedLanguage("russian")} disabled={busy}>Русский</button><button className={expectedLanguage === "mixed" ? "active" : ""} onClick={() => setExpectedLanguage("mixed")} disabled={busy}>KZ + RU</button></div></div>

        <div className="run-row"><button className="run" disabled={!file || busy || recording} onClick={run}>{busy ? "Идёт обработка…" : `Расшифровать · ${selected?.parameters ?? "…"}`}</button>{busy && <button className="cancel" onClick={cancel}>Отменить</button>}</div>
      </section>

      <section className="result-panel">
        <div className="step-head"><span>03</span><h2>Текст</h2><em>{job?.status === "completed" ? "готово" : job?.stage ?? "ожидает"}</em></div>
        {job && <div className="progress"><div style={{ width: `${Math.round(job.progress * 100)}%` }} /><span>{Math.round(job.progress * 100)}%</span></div>}
        {job?.status === "failed" && <p className="failure">{job.error || "Не удалось обработать аудио."}</p>}
        {job?.status === "cancelled" && <p className="failure">Задача отменена. Исходный файл остаётся выбранным.</p>}
        <textarea value={result?.text ?? ""} onChange={(event) => setResult((previous) => previous ? { ...previous, text: event.target.value } : previous)} placeholder="Здесь появится расшифровка…" disabled={!result} />
        {result && <div className="result-actions"><button className="text-button" onClick={copyText}>Скопировать</button><a href={`/api/transcriptions/${result.id}/result.txt`} download>Скачать TXT</a><button className="text-button" onClick={reset}>Новая запись</button></div>}
      </section>
      <footer className="footnote">GigaAM Multilingual · обработка локально · первая загрузка модели требует интернет</footer>
    </main>
  );
}
