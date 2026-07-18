import { useEffect, type ReactNode } from "react";
import { useApp } from "../store";

interface ModalProps {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}

export function Modal({ title, children, confirmLabel, cancelLabel, danger, onConfirm, onClose }: ModalProps) {
  const { t } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="h3">{title}</h3>
        <div>{children}</div>
        <div className="modal-actions mt-6">
          <button className="btn btn-ghost sm" onClick={onClose}>{cancelLabel ?? t("common.cancel")}</button>
          {onConfirm && (
            <button className={`btn sm ${danger ? "btn-danger" : "btn-gold"}`} onClick={onConfirm}>{confirmLabel ?? t("common.confirm")}</button>
          )}
        </div>
      </div>
    </div>
  );
}
