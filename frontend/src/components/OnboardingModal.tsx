import { useState } from "react";
import { Logo } from "../Logo";
import { useApp } from "../store";
import { Icon } from "../icons";

type ModelId = "220m" | "600m";

interface OnboardingModalProps {
  onDownloadModels: (models: string[]) => void;
  onSkip: () => void;
}

export function OnboardingModal({ onDownloadModels, onSkip }: OnboardingModalProps) {
  const { t } = useApp();
  const [selected, setSelected] = useState<ModelId | null>(null);

  const canDownload = selected !== null;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(520px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "var(--sp-5)" }}>
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <Logo size={56} variant="mark" />
          </div>
          <h3 className="h3" style={{ marginBottom: "var(--sp-2)" }}>
            {t("onboarding.title")}
          </h3>
          <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            {t("onboarding.description")}
          </p>
        </div>

        {/* Select model label */}
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--on-surface-variant)", marginBottom: "var(--sp-3)" }}>
          {t("onboarding.selectModel")}
        </div>

        {/* Model cards — radio style, only one selectable */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginBottom: "var(--sp-5)" }}>
          {/* 600M model — accurate (listed first as recommended) */}
          <ModelCard
            id="600m"
            label={t("onboarding.model600m")}
            desc={t("onboarding.model600mDesc")}
            size="~2.3 ГБ"
            badge={t("onboarding.modelBadgeAccurate")}
            badgeIcon="verified"
            selected={selected === "600m"}
            onSelect={() => setSelected("600m")}
          />

          {/* 220M model — fast */}
          <ModelCard
            id="220m"
            label={t("onboarding.model220m")}
            desc={t("onboarding.model220mDesc")}
            size="~880 МБ"
            badge={t("onboarding.modelBadgeFast")}
            badgeIcon="bolt"
            selected={selected === "220m"}
            onSelect={() => setSelected("220m")}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)" }}>
          <button className="btn btn-ghost sm" onClick={onSkip}>
            {t("onboarding.skip")}
          </button>
          <button
            className="btn btn-gold"
            onClick={() => selected && onDownloadModels([selected])}
            disabled={!canDownload}
            style={{ opacity: canDownload ? 1 : 0.4, cursor: canDownload ? "pointer" : "not-allowed" }}
          >
            <Icon name="download" size={16} />
            {t("onboarding.download")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ModelCardProps {
  id: string;
  label: string;
  desc: string;
  size: string;
  badge: string;
  badgeIcon: string;
  selected: boolean;
  onSelect: () => void;
}

function ModelCard({ label, desc, size, badge, badgeIcon, selected, onSelect }: ModelCardProps) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--sp-3)",
        padding: "var(--sp-4)",
        borderRadius: "var(--r-md)",
        background: selected ? "var(--overlay-bg)" : "transparent",
        border: "1px solid",
        borderColor: selected ? "var(--gold-shimmer)" : "var(--border-soft)",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {/* Radio indicator */}
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flex: "0 0 auto",
        border: "2px solid",
        borderColor: selected ? "var(--gold-shimmer)" : "var(--on-surface-variant)",
        background: selected ? "var(--gold-shimmer)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: 2,
      }}>
        {selected && (
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--obsidian)" }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
            padding: "2px 8px", borderRadius: 100,
            background: selected ? "rgba(230, 202, 101, 0.15)" : "var(--border-soft)",
            color: selected ? "var(--gold-shimmer)" : "var(--on-surface-variant)",
          }}>
            <Icon name={badgeIcon} size={11} fill />
            {badge}
          </span>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--on-surface-variant)" }}>
          {desc}
        </div>
      </div>

      {/* Size */}
      <span style={{ fontSize: 11, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)", flex: "0 0 auto", marginTop: 2 }}>
        {size}
      </span>
    </div>
  );
}
