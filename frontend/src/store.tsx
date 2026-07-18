// ============================================================
// QazTriber — app context: shared state + i18n + navigation
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getModels, getPreload, getSystemInfo, type Job, type Model, type Preload, type SystemInfo } from "./api";
import { translate, type Lang } from "./i18n";
import {
  loadPrefs, loadSessions, savePrefs, upsertSession as upsertSessionInStore,
  patchSession as patchSessionInStore, removeSessions as removeSessionsInStore,
  type Prefs, type SessionRecord,
} from "./storage";

export type View = "home" | "history" | "session" | "models" | "settings";

interface AppCtx {
  // i18n
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;

  // prefs
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  theme: "light" | "dark";

  // navigation
  view: View;
  currentSessionId: string | null;
  navigate: (view: View, sessionId?: string | null) => void;

  // api state
  models: Model[];
  preload: Preload | null;
  systemInfo: SystemInfo | null;
  refreshModels: () => Promise<void>;
  refreshPreload: () => Promise<void>;

  // sessions (localStorage)
  sessions: SessionRecord[];
  refreshSessions: () => void;
  upsertSession: (rec: SessionRecord) => void;
  patchSession: (id: string, patch: Partial<SessionRecord>) => void;
  removeSessions: (ids: string[]) => void;

  // global error
  error: string | null;
  setError: (msg: string | null) => void;
}

const Ctx = createContext<AppCtx | null>(null);

function resolveTheme(theme: Prefs["theme"]): "light" | "dark" {
  if (theme === "system") {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const [lang, setLangState] = useState<Lang>(() => loadPrefs().lang);
  const [theme, setTheme] = useState<"light" | "dark">(() => resolveTheme(loadPrefs().theme));

  const [view, setView] = useState<View>("home");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [models, setModels] = useState<Model[]>([]);
  const [preload, setPreload] = useState<Preload | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  const [sessions, setSessions] = useState<SessionRecord[]>(() => loadSessions());
  const [error, setError] = useState<string | null>(null);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  // Apply theme to <html data-theme>
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  }, [theme]);

  // React to system theme changes when in "system" mode
  useEffect(() => {
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => setTheme(mq.matches ? "light" : "dark");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [prefs.theme]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
    if (patch.lang) setLangState(patch.lang);
    if (patch.theme) setTheme(resolveTheme(patch.theme));
  }, []);

  const setLang = useCallback((l: Lang) => setPrefs({ lang: l }), [setPrefs]);

  const navigate = useCallback((nextView: View, sessionId: string | null = null) => {
    setView(nextView);
    if (sessionId !== null) setCurrentSessionId(sessionId);
  }, []);

  const refreshModels = useCallback(async () => {
    try { setModels(await getModels()); } catch (reason) { setError(`${translate(lang, "error.api")}: ${(reason as Error).message}`); }
  }, [lang]);

  const refreshPreload = useCallback(async () => {
    try { setPreload(await getPreload()); } catch { /* silent */ }
  }, []);

  const refreshSystemInfo = useCallback(async () => {
    try { setSystemInfo(await getSystemInfo()); } catch { /* silent */ }
  }, []);

  // Initial load
  useEffect(() => {
    refreshModels();
    refreshPreload();
    refreshSystemInfo();
  }, [refreshModels, refreshPreload, refreshSystemInfo]);

  // Poll preload while downloading
  useEffect(() => {
    if (preload?.status !== "downloading") return;
    const timer = window.setInterval(() => refreshPreload(), 1200);
    return () => window.clearInterval(timer);
  }, [preload?.status, refreshPreload]);

  // When preload finishes, refresh models
  useEffect(() => {
    if (!preload || preload.status === "downloading" || preload.status === "idle") return;
    refreshModels();
    if (preload.status === "failed" && preload.error) setError(preload.error);
  }, [preload?.status, preload?.error, refreshModels]);

  const refreshSessions = useCallback(() => setSessions(loadSessions()), []);

  const upsertSession = useCallback((rec: SessionRecord) => {
    setSessions(upsertSessionInStore(rec));
  }, []);

  const patchSession = useCallback((id: string, patch: Partial<SessionRecord>) => {
    setSessions(patchSessionInStore(id, patch));
  }, []);

  const removeSessions = useCallback((ids: string[]) => {
    setSessions(removeSessionsInStore(ids));
  }, []);

  const value = useMemo<AppCtx>(() => ({
    lang, setLang, t,
    prefs, setPrefs, theme,
    view, currentSessionId, navigate,
    models, preload, systemInfo, refreshModels, refreshPreload,
    sessions, refreshSessions, upsertSession, patchSession, removeSessions,
    error, setError,
  }), [lang, setLang, t, prefs, setPrefs, theme, view, currentSessionId, navigate, models, preload, systemInfo, refreshModels, refreshPreload, sessions, refreshSessions, upsertSession, patchSession, removeSessions, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// Helper: derive a SessionRecord from a Job + source info
export function jobToSession(job: Job, opts: { sourceType: SessionRecord["sourceType"]; originalFilename: string | null; durationMs: number | null; transcriptPreview?: string | null; transcript?: string | null; displayName?: string | null }): SessionRecord {
  return {
    id: job.id,
    createdAt: Date.now(),
    sourceType: opts.sourceType,
    originalFilename: opts.originalFilename,
    durationMs: opts.durationMs,
    status: job.status,
    transcriptPreview: opts.transcriptPreview ?? null,
    transcript: opts.transcript ?? null,
    modelUsed: job.model,
    expectedLanguage: job.expected_language,
    errorMessage: job.error,
    progress: job.progress,
    stage: job.stage,
    displayName: opts.displayName ?? null,
  };
}
