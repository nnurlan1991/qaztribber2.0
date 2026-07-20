import { Logo } from "../Logo";
import { useApp } from "../store";

interface OnboardingModalProps {
  onDownloadModels: () => void;
  onSkip: () => void;
}

export function OnboardingModal({ onDownloadModels, onSkip }: OnboardingModalProps) {
  const { t } = useApp();

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

        {/* Model cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginBottom: "var(--sp-6)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-4)",
              padding: "var(--sp-4)",
              borderRadius: "var(--r-md)",
              background: "var(--overlay-bg)",
              border: "1px solid var(--border-soft)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--gold-shimmer)",
                flex: "0 0 auto",
              }}
            >
              220M
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t("onboarding.model220m")}</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                {t("onboarding.model220mDesc")}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-4)",
              padding: "var(--sp-4)",
              borderRadius: "var(--r-md)",
              background: "var(--overlay-bg)",
              border: "1px solid var(--border-soft)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--gold-shimmer)",
                flex: "0 0 auto",
              }}
            >
              600M
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t("onboarding.model600m")}</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                {t("onboarding.model600mDesc")}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)" }}>
          <button className="btn btn-ghost sm" onClick={onSkip}>
            {t("onboarding.skip")}
          </button>
          <button className="btn btn-gold sm" onClick={onDownloadModels}>
            {t("onboarding.downloadBoth")}
          </button>
        </div>
      </div>
    </div>
  );
}
