import { useApp, type View } from "../store";
import { LANGS } from "../i18n";
import { Icon } from "../icons";

const VIEW_TITLE: Record<View, string> = {
  home: "nav.workspace",
  history: "nav.history",
  session: "nav.session",
  models: "nav.models",
  settings: "nav.settings",
};

const VIEW_CRUMB: Record<View, string> = {
  home: "app.local",
  history: "nav.management",
  session: "nav.history",
  models: "nav.management",
  settings: "nav.management",
};

export function TopBar() {
  const { view, navigate, currentSessionId, lang, setLang, prefs, setPrefs, models, t } = useApp();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="crumb">{t(VIEW_CRUMB[view])}</span>
        <h1>{t(VIEW_TITLE[view])}</h1>
      </div>
      <div className="topbar-spacer" />

      {view === "session" && currentSessionId && (
        <button className="icon-btn" onClick={() => navigate("history")} title={t("session.back")}>
          <Icon name="arrow_back" size={20} />
        </button>
      )}

      {/* Model toggle — compact, красивый */}
      {models.length > 0 && (
        <div className="model-toggle" title={t("settings.defaultModel")}>
          {models.map((m) => {
            const active = prefs.defaultModel === m.id;
            return (
              <button
                key={m.id}
                className={active ? "active" : ""}
                onClick={() => setPrefs({ defaultModel: m.id })}
                title={m.id === "220m" ? t("models.smallDesc") : t("models.largeDesc")}
              >
                <span className={`cache-dot ${m.cached ? "" : "off"}`} />
                {m.parameters}
              </button>
            );
          })}
        </div>
      )}

      {/* Language switch */}
      <div className="segmented" style={{ padding: 3 }}>
        {LANGS.map((l) => (
          <button key={l.id} className={lang === l.id ? "active" : ""} onClick={() => setLang(l.id)} style={{ padding: "6px 12px", fontSize: 12 }}>
            {l.short}
          </button>
        ))}
      </div>

      {/* Quick theme toggle */}
      <button
        className="icon-btn"
        onClick={() => setPrefs({ theme: prefs.theme === "dark" ? "light" : "dark" })}
        title={prefs.theme === "dark" ? t("settings.theme.light") : t("settings.theme.dark")}
      >
        <Icon name={prefs.theme === "dark" ? "light_mode" : "dark_mode"} size={20} />
      </button>

      <button className="icon-btn" onClick={() => navigate("settings")} title={t("nav.settings")}>
        <Icon name="settings" size={20} />
      </button>
    </header>
  );
}
