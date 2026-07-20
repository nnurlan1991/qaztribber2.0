import { useState, useEffect, useCallback } from "react";
import { AppProvider, useApp } from "./store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
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

function Shell() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const { setError, preload } = useApp();

  useEffect(() => {
    isFirstLaunch()
      .then(({ first_launch }) => {
        if (first_launch) setShowOnboarding(true);
      })
      .catch(() => {
        // Silently ignore — onboarding is not critical
      });
  }, []);

  const handleDownloadModels = useCallback(async () => {
    try {
      await markInitialized();
      setShowOnboarding(false);
      await startPreload();
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
      <Sidebar />
      <main className="main">
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
