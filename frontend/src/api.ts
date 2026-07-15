export type Model = {
  id: "220m" | "600m";
  title: string;
  gigaam_name: string;
  parameters: string;
  description: string;
  cached: boolean;
};

export type Job = {
  id: string;
  status: "queued" | "preparing" | "loading_model" | "transcribing" | "completed" | "failed" | "cancelled";
  progress: number;
  stage: string;
  error: string | null;
  model: "220m" | "600m";
  expected_language: "kazakh" | "russian" | "mixed";
  filename: string;
};

export type Result = { id: string; text: string; model: "220m" | "600m"; expected_language: "kazakh" | "russian" | "mixed"; duration_seconds: number | null };
export type Preload = { status: "idle" | "downloading" | "completed" | "failed"; progress: number; stage: string; error: string | null };

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
export const getResult = (jobId: string) => request<Result>(`/api/transcriptions/${jobId}/result`);
export const cancelJob = (jobId: string) => request<Job>(`/api/transcriptions/${jobId}/cancel`, { method: "POST" });
export const deleteJob = (jobId: string) => request<void>(`/api/transcriptions/${jobId}`, { method: "DELETE" });
export const getPreload = () => request<Preload>("/api/models/preload");
export const startPreload = () => request<Preload>("/api/models/preload", { method: "POST" });

export async function createJob(file: File, model: Model["id"], expectedLanguage: Job["expected_language"], start: number, end: number): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  form.append("expected_language", expectedLanguage);
  form.append("start_seconds", String(start));
  if (end > start) form.append("end_seconds", String(end));
  return request<Job>("/api/transcriptions", { method: "POST", body: form });
}

export function watchJob(jobId: string, onJob: (job: Job) => void, onError: () => void): () => void {
  const events = new EventSource(`/api/transcriptions/${jobId}/events`);
  events.addEventListener("progress", (event) => onJob(JSON.parse((event as MessageEvent).data) as Job));
  events.onerror = () => {
    onError();
    events.close();
  };
  return () => events.close();
}
