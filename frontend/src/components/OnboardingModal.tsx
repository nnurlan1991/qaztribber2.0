import { useState } from "react";
import { Logo } from "../Logo";
import { useApp } from "../store";

interface OnboardingModalProps {
  onDownloadModels: (models: string[]) => void;
  onSkip: () => void;
}

export function OnboardingModal({ onDownloadModels, onSkip }: OnboardingModalProps) {
  const { t } = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set(["220m", "600m"]));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(["220m", "600m"]));
  const selectOne = (id: string) => setSelected(new Set([id]));

  const canDownload = selected.size > 0;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(520px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "var(--sp-6)" }}>
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <Logo size={64} variant="mark" />
          </div>
          <h3 className="h3" style={{ marginBottom: "var(--sp-2)" }}>
            {t("onboarding.title")}
          </h3>
          <p className="muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            {t("onboarding.description")}
          </p>
        </div>

        {/* Model cards with checkboxes */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
          {/* Both models option */}
          <div
            onClick={selectAll}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-3)",
              padding: "var(--sp-4)",
              borderRadius: "var(--r-md)",
              background: selected.size === 2 ? "var(--overlay-bg)" : "transparent",
              border: "1px solid",
              borderColor: selected.size === 2 ? "var(--gold-shimmer)" : "var(--border-soft)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, flex: "0 0 auto",
              border: "2px solid",
              borderColor: selected.size === 2 ? "var(--gold-shimmer)" : "var(--on-surface-variant)",
              background: selected.size === 2 ? "var(--gold-shimmer)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {selected.size === 2 && (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--obsidian)" strokeWidth="4" style={{ width: 14, height: 14 }}>
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t("onboarding.downloadBoth")}</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>~3.2 ГБ</div>
            </div>
          </div>

          {/* 220M model */}
          <div
            onClick={() => toggle("220m")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-4)",
              padding: "var(--sp-4)",
              borderRadius: "var(--r-md)",
              background: selected.has("220m") ? "var(--overlay-bg)" : "transparent",
              border: "1px solid",
              borderColor: selected.has("220m") ? "var(--gold-shimmer)" : "var(--border-soft)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, flex: "0 0 auto",
              border: "2px solid",
              borderColor: selected.has("220m") ? "var(--gold-shimmer)" : "var(--on-surface-variant)",
              background: selected.has("220m") ? "var(--gold-shimmer)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {selected.has("220m") && (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--obsidian)" strokeWidth="4" style={{ width: 14, height: 14 }}>
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--gold-shimmer)", flex: "0 0 auto" }}>
              220M
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t("onboarding.model220m")}</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{t("onboarding.model220mDesc")}</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>~880 МБ</span>
          </div>

          {/* 600M model */}
          <div
            onClick={() => toggle("600m")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-4)",
              padding: "var(--sp-4)",
              borderRadius: "var(--r-md)",
              background: selected.has("600m") ? "var(--overlay-bg)" : "transparent",
              border: "1px solid",
              borderColor: selected.has("600m") ? "var(--gold-shimmer)" : "var(--border-soft)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, flex: "0 0 auto",
              border: "2px solid",
              borderColor: selected.has("600m") ? "var(--gold-shimmer)" : "var(--on-surface-variant)",
              background: selected.has("600m") ? "var(--gold-shimmer)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {selected.has("600m") && (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--obsidian)" strokeWidth="4" style={{ width: 14, height: 14 }}>
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--gold-shimmer)", flex: "0 0 auto" }}>
              600M
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t("onboarding.model600m")}</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{t("onboarding.model600mDesc")}</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>~2.3 ГБ</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)" }}>
          <button className="btn btn-ghost sm" onClick={onSkip}>
            {t("onboarding.skip")}
          </button>
          <button
            className="btn btn-gold sm"
            onClick={() => onDownloadModels(Array.from(selected))}
            disabled={!canDownload}
            style={{ opacity: canDownload ? 1 : 0.5 }}
          >
            {t("onboarding.downloadSelected")}
          </button>
        </div>
      </div>
    </div>
  );
}
