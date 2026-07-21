export type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
};

export type Model = {
  id: "220m" | "600m";
  title: string;
  gigaam_name: string;
  parameters: string;
  description: string;
  cached: boolean;
  storage_path: string | null;
  size_bytes: number;
};

export type StageStatus = {
  name: "audio_preparation" | "model_download" | "model_load" | "transcription" | "merging" | "done";
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
  detail: string;
};

export type Job = {
  id: string;
  status: "queued" | "preparing" | "loading_model" | "transcribing" | "paused" | "completed" | "failed" | "cancelled";
  progress: number;
  stage: string;
  error: string | null;
  error_code: string | null;
  model: "220m" | "600m";
  expected_language: "kazakh" | "russian" | "mixed";
  filename: string;
  stages: StageStatus[];
};

export type Result = { id: string; text: string; model: "220m" | "600m"; expected_language: "kazakh" | "russian" | "mixed"; duration_seconds: number | null };
export type ModelDownloadStatus = {
  model_id: "220m" | "600m";
  status: "pending" | "downloading" | "completed" | "failed";
  progress: number;
};

export type Preload = { status: "idle" | "downloading" | "completed" | "failed" | "cancelled" | "paused"; progress: number; stage: string; error: string | null; error_code: string | null; models: ModelDownloadStatus[] };

export type SystemInfo = {
  device: string;
  cpu_count: number;
  cpu_brand: string;
  memory_gb: number;
  os: string;
  arch: string;
  speed_multiplier_220m: number;
  speed_multiplier_600m: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Локальный сервер вернул ошибку.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const getModels = () => request<Model[]>("/api/models");
export const deleteModel = (modelId: Model["id"]) => request<void>(`/api/models/${modelId}`, { method: "DELETE" });
export const getResult = (jobId: string) => request<Result>(`/api/transcriptions/${jobId}/result`);
export const cancelJob = (jobId: string) => request<Job>(`/api/transcriptions/${jobId}/cancel`, { method: "POST" });
export const pauseJob = (jobId: string) => request<Job>(`/api/transcriptions/${jobId}/pause`, { method: "POST" });
export const resumeJob = (jobId: string) => request<Job>(`/api/transcriptions/${jobId}/resume`, { method: "POST" });
export const deleteJob = (jobId: string) => request<void>(`/api/transcriptions/${jobId}`, { method: "DELETE" });
export const getPreload = () => request<Preload>("/api/models/preload");
export const startPreload = (models?: string[]) => request<Preload>("/api/models/preload", { method: "POST", body: JSON.stringify(models), headers: { "Content-Type": "application/json" } });
export const getSystemInfo = () => request<SystemInfo>("/api/system");
export const isFirstLaunch = () => request<{ first_launch: boolean }>("/api/first-launch");
export const markInitialized = () => request<{ initialized: boolean }>("/api/first-launch/initialize", { method: "POST" });
export const cancelPreload = () => request<Preload>("/api/models/preload/cancel", { method: "POST" });
export const getJob = (jobId: string) => request<Job>(`/api/transcriptions/${jobId}`);
const LOG_LINE_RE = /^(\S+)\s+\[(DEBUG|INFO|WARNING|ERROR|CRITICAL)\]\s+(.*)$/;

function parseLogLine(line: string): LogEntry {
  const m = LOG_LINE_RE.exec(line);
  if (m) return { timestamp: m[1], level: m[2], message: m[3] };
  return { timestamp: "", level: "INFO", message: line };
}

export const getLogs = async (tail = 100, level = "INFO"): Promise<LogEntry[]> => {
  const data = await request<{ lines: string[]; total_in_file: number; returned: number }>(
    `/api/logs?tail=${tail}&level=${level}`
  );
  return data.lines.map(parseLogLine);
};

export async function createJob(file: File, model: Model["id"], expectedLanguage: Job["expected_language"], start: number, end: number): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  form.append("expected_language", expectedLanguage);
  form.append("start_seconds", String(start));
  if (end > start) form.append("end_seconds", String(end));
  return request<Job>("/api/transcriptions", { method: "POST", body: form });
}

const TERMINAL_STATUSES = new Set<Job["status"]>(["completed", "failed", "cancelled"]);

/**
 * Polling вместо SSE — надёжнее, нет ложных onerror при закрытии стрима.
 * Опрашивает /api/transcriptions/{id} каждые 500мс до терминального статуса.
 */
export function watchJob(jobId: string, onJob: (job: Job) => void, onError: () => void): () => void {
  let stopped = false;
  let timer: number | null = null;

  async function poll() {
    if (stopped) return;
    try {
      const job = await getJob(jobId);
      if (stopped) return;
      onJob(job);
      if (TERMINAL_STATUSES.has(job.status)) {
        stopped = true;
        return;
      }
    } catch {
      if (!stopped) {
        onError();
        stopped = true;
      }
      return;
    }
    if (!stopped) {
      timer = window.setTimeout(poll, 500);
    }
  }

  poll();

  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
  };
}
