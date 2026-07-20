import { useApp } from "../store";
import { Icon } from "../icons";

interface ModelLoadWarningProps {
  onClose: () => void;
  estimatedSeconds: number;
}

export function ModelLoadWarning({ onClose, estimatedSeconds }: ModelLoadWarningProps) {
  const { t } = useApp();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(460px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: "var(--sp-6)" }}>
          <div style={{ marginBottom: "var(--sp-3)" }}>
            <Icon name="warning" size={48} />
          </div>
          <h3 className="h3" style={{ marginBottom: "var(--sp-2)" }}>
            {t("modelLoadWarning.title")}
          </h3>
          <p className="muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            {t("modelLoadWarning.message", { seconds: estimatedSeconds })}
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-soft sm" onClick={onClose}>
            {t("modelLoadWarning.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
