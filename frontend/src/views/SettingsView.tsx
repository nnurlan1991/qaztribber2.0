import { useApp } from "../store";
import { LANGS } from "../i18n";
import { Icon } from "../icons";
import { Logo } from "../Logo";

const APP_VERSION = "1.0.0";

export function SettingsView() {
  const { t, lang, setLang, prefs, setPrefs, models } = useApp();

  const themes: { id: "light" | "dark" | "system"; labelKey: string; icon: string }[] = [
    { id: "dark", labelKey: "settings.theme.dark", icon: "dark_mode" },
    { id: "light", labelKey: "settings.theme.light", icon: "light_mode" },
    { id: "system", labelKey: "settings.theme.system", icon: "brightness_auto" },
  ];

  return (
    <div className="content narrow scroll">
      {/* Appearance */}
      <section className="card pad mb-6">
        <div className="row-flex gap-3 mb-4"><Icon name="palette" size={22} /><h2 className="h2">{t("settings.appearance")}</h2></div>
        <div className="meta-row"><span className="meta-key">{t("settings.theme")}</span>
          <div className="segmented">
            {themes.map((th) => (
              <button key={th.id} className={prefs.theme === th.id ? "active" : ""} onClick={() => setPrefs({ theme: th.id })}>
                <Icon name={th.icon} size={16} /> {t(th.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="meta-row"><span className="meta-key">{t("settings.language")}</span>
          <div className="segmented">
            {LANGS.map((l) => (
              <button key={l.id} className={lang === l.id ? "active" : ""} onClick={() => setLang(l.id)}>{l.label}</button>
            ))}
          </div>
        </div>
      </section>

      {/* Recognition */}
      <section className="card pad mb-6">
        <div className="row-flex gap-3 mb-4"><Icon name="memory" size={22} /><h2 className="h2">{t("settings.recognition")}</h2></div>
        <div className="meta-row"><span className="meta-key">{t("settings.defaultModel")}</span>
          <div className="segmented">
            {models.map((m) => (
              <button key={m.id} className={prefs.defaultModel === m.id ? "active" : ""} onClick={() => setPrefs({ defaultModel: m.id })}>
                {m.parameters}
              </button>
            ))}
          </div>
        </div>
        <div className="meta-row"><span className="meta-key">{t("settings.engine")}</span><span className="meta-val mono" style={{ fontSize: 12 }}>{t("settings.engineValue")}</span></div>
      </section>

      {/* About */}
      <section className="card pad mb-6">
        <div className="row-flex gap-4 mb-4">
          <Logo size={56} variant="mark" />
          <div className="stack" style={{ gap: 2 }}>
            <h2 className="h2 gold-text">{t("app.name")}</h2>
            <span className="mono faint" style={{ fontSize: 11 }}>{t("app.tagline")} · {t("app.version")} {APP_VERSION}</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{t("settings.aboutDesc")}</p>
        <div className="divider" />
        <div className="meta-row"><span className="meta-key">{t("settings.version")}</span><span className="meta-val mono">{APP_VERSION}</span></div>
        <div className="meta-row"><span className="meta-key">{t("settings.locale")}</span><span className="meta-val mono">{lang === "kz" ? "kk-KZ" : "ru-RU"}</span></div>
        <div className="meta-row"><span className="meta-key">{t("settings.engine")}</span><span className="meta-val mono" style={{ fontSize: 12 }}>GigaAM · ONNX Runtime · CPU</span></div>
      </section>

      {/* Links */}
      <section className="card pad">
        <div className="row-flex gap-3 mb-4"><Icon name="globe" size={22} /><h2 className="h2">{t("settings.links")}</h2></div>
        <a className="row" href="https://qaztribber.aidi-lab.kz" target="_blank" rel="noreferrer">
          <span className="row-icon"><Icon name="language" size={18} /></span>
          <div className="row-body"><div className="row-title">{t("settings.website")}</div><div className="row-preview">qaztribber.aidi-lab.kz</div></div>
          <Icon name="open_in_new" size={18} />
        </a>
      </section>
    </div>
  );
}
