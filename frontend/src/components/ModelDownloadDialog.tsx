import { useApp } from "../store";

interface ModelDownloadDialogProps {
  modelName: string;
  onDownload: (modelId: "220m" | "600m") => void;
  onCancel: () => void;
}

export function ModelDownloadDialog({ modelName, onDownload, onCancel }: ModelDownloadDialogProps) {
  const { t } = useApp();

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ width: "min(460px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: "var(--sp-6)" }}>
          <h3 className="h3" style={{ marginBottom: "var(--sp-2)" }}>
            {t("modelDialog.title")}
          </h3>
          <p className="muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            {t("modelDialog.message", { model: modelName })}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
          <button
            className="btn btn-soft"
            style={{ justifyContent: "flex-start", padding: "var(--sp-4)", gap: "var(--sp-4)", textAlign: "left" }}
            onClick={() => onDownload("220m")}
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
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {t("modelDialog.download220m")}
            </span>
          </button>

          <button
            className="btn btn-soft"
            style={{ justifyContent: "flex-start", padding: "var(--sp-4)", gap: "var(--sp-4)", textAlign: "left" }}
            onClick={() => onDownload("600m")}
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
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {t("modelDialog.download600m")}
            </span>
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost sm" onClick={onCancel}>
            {t("modelDialog.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
