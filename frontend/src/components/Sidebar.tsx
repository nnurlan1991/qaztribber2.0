import { useApp, type View } from "../store";
import { Icon } from "../icons";
import { Logo } from "../Logo";

interface NavDef {
  view: View;
  icon: string;
  labelKey: string;
}

const MAIN_NAV: NavDef[] = [
  { view: "home", icon: "mic", labelKey: "nav.workspace" },
  { view: "history", icon: "history", labelKey: "nav.history" },
];

const MGMT_NAV: NavDef[] = [
  { view: "models", icon: "memory", labelKey: "nav.models" },
  { view: "settings", icon: "settings", labelKey: "nav.settings" },
];

export function Sidebar() {
  const { view, navigate, t, models, sessions, prefs } = useApp();

  const cachedCount = models.filter((m) => m.cached).length;
  const totalModels = models.length;
  const activeSessions = sessions.filter((s) => s.status === "transcribing" || s.status === "queued" || s.status === "preparing" || s.status === "loading_model").length;
  const defaultModel = models.find((m) => m.id === prefs.defaultModel);

  const dotClass = cachedCount === 0 ? "idle" : cachedCount === totalModels ? "ready" : "";

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo size={34} variant="mark" />
        <div className="stack" style={{ gap: 0 }}>
          <span className="brand-name">{t("app.name")}</span>
          <span className="brand-sub">{t("app.tagline")}</span>
        </div>
      </div>

      <nav className="nav-section">
        <div className="nav-label">{t("nav.main")}</div>
        {MAIN_NAV.map((item) => (
          <button key={item.view} className={`nav-item ${view === item.view ? "active" : ""}`} onClick={() => navigate(item.view)}>
            <Icon name={item.icon} size={20} fill={view === item.view} />
            <span>{t(item.labelKey)}</span>
            {item.view === "history" && activeSessions > 0 && <span className="badge">{activeSessions}</span>}
          </button>
        ))}
      </nav>

      <nav className="nav-section">
        <div className="nav-label">{t("nav.management")}</div>
        {MGMT_NAV.map((item) => (
          <button key={item.view} className={`nav-item ${view === item.view ? "active" : ""}`} onClick={() => navigate(item.view)}>
            <Icon name={item.icon} size={20} fill={view === item.view} />
            <span>{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="model-pill" onClick={() => navigate("models")} role="button" tabIndex={0}>
          <span className={`model-dot ${dotClass}`} />
          <span className="mono" style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
            {defaultModel?.parameters ?? "—"} · {cachedCount}/{totalModels}
          </span>
          <Icon name="chevron_right" size={16} />
        </div>
      </div>
    </aside>
  );
}
