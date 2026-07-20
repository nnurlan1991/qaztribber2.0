import { useApp } from "../store";
import type { SessionStatus } from "../storage";

const STATUS_CLASS: Record<SessionStatus, string> = {
  queued: "queued",
  preparing: "preparing",
  loading_model: "loading_model",
  transcribing: "transcribing",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  paused: "paused",
};

const STATUS_KEY: Record<SessionStatus, string> = {
  queued: "status.queued",
  preparing: "status.preparing",
  loading_model: "status.loading_model",
  transcribing: "status.transcribing",
  completed: "status.completed",
  failed: "status.failed",
  cancelled: "status.cancelled",
  paused: "status.paused",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const { t } = useApp();
  const cls = STATUS_CLASS[status] ?? "queued";
  return (
    <span className={`badge-status ${cls}`}>
      <span className="dot" />
      {t(STATUS_KEY[status] ?? "status.queued")}
    </span>
  );
}
