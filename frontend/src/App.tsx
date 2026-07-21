import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppProvider, useApp } from "./store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { DownloadStatusBar } from "./components/DownloadStatusBar";
import { Icon } from "./icons";
import { HomeView } from "./views/HomeView";
import { HistoryView } from "./views/HistoryView";
import { SessionView } from "./views/SessionView";
import { ModelsView } from "./views/ModelsView";
import { SettingsView } from "./views/SettingsView";
import { OnboardingModal } from "./components/OnboardingModal";
import { DownloadProgressModal } from "./components/DownloadProgressModal";
import { isFirstLaunch, markInitialized, startPreload } from "./api";

function GlobalError() {
  const { error, setError, t } = useApp();
  if (!error) return null;
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, maxWidth: 380 }}>
      <div className="notice error" style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.5)" }}>
        <Icon name="error" size={20} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{t("common.error")}</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>{error}</div>
        </div>
        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setError(null)}><Icon name="close" size={16} /></button>
      </div>
    </div>
  );
}

function ViewRouter() {
  const { view } = useApp();
  switch (view) {
    case "home": return <HomeView />;
    case "history": return <HistoryView />;
    case "session": return <SessionView />;
    case "models": return <ModelsView />;
    case "settings": return <SettingsView />;
    default: return <HomeView />;
  }
}

type SidecarStatus = "connected" | "restarting" | "unreachable" | "failed";

function Shell() {
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const { setError, preload, t } = useApp();

  useEffect(() => {
    isFirstLaunch()
      .then(({ first_launch }) => {
        if (first_launch) setShowOnboarding(true);
      })
      .catch(() => {
        // Silently ignore — onboarding is not critical
      });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen("sidecar-status", (event: { payload: string }) => {
      const status = event.payload as SidecarStatus;
      setSidecarStatus(status);
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {
      // Not in Tauri context (dev browser) — ignore
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleDownloadModels = useCallback(async (models: string[]) => {
    try {
      await markInitialized();
      setShowOnboarding(false);
      await startPreload(models);
      setShowDownloadModal(true);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [setError]);

  const handleSkip = useCallback(async () => {
    try {
      await markInitialized();
    } catch {
      // Silently ignore
    }
    setShowOnboarding(false);
  }, []);

  return (
    <div className="app">
      {/* Sidecar status banner */}
      {sidecarStatus && sidecarStatus !== "connected" && (
        <div
          className={`sidecar-banner sidecar-banner-${sidecarStatus}`}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 500,
            background: sidecarStatus === "restarting"
              ? "rgba(247, 189, 72, 0.15)"
              : "rgba(239, 68, 68, 0.15)",
            color: sidecarStatus === "restarting"
              ? "var(--status-warn, #f59e0b)"
              : "var(--status-error, #ef4444)",
            borderBottom: `1px solid ${
              sidecarStatus === "restarting"
                ? "rgba(247, 189, 72, 0.3)"
                : "rgba(239, 68, 68, 0.3)"
            }`,
            backdropFilter: "blur(8px)",
          }}
        >
          {sidecarStatus === "restarting" && <span className="spinner" style={{ width: 14, height: 14 }} />}
          <span>
            {sidecarStatus === "restarting" && t("sidecar.restarting")}
            {sidecarStatus === "unreachable" && t("sidecar.unreachable")}
            {sidecarStatus === "failed" && t("sidecar.failed")}
          </span>
        </div>
      )}
      <Sidebar />
      <main
        className="main"
        style={{ paddingTop: sidecarStatus && sidecarStatus !== "connected" ? 40 : 0 }}
      >
        <DownloadStatusBar onOpenDetails={() => setShowDownloadModal(true)} />
        <TopBar onOpenDownloadModal={() => setShowDownloadModal(true)} />
        <ViewRouter />
      </main>
      <GlobalError />
      {showOnboarding && (
        <OnboardingModal
          onDownloadModels={handleDownloadModels}
          onSkip={handleSkip}
        />
      )}
      {showDownloadModal && preload && (preload.status === "downloading" || preload.status === "paused" || preload.status === "completed" || preload.status === "failed" || preload.status === "cancelled") && (
        <DownloadProgressModal onClose={() => setShowDownloadModal(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
