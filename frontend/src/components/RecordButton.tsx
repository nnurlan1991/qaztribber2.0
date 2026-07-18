import { Icon } from "../icons";

interface RecordButtonProps {
  recording: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function RecordButton({ recording, disabled, onClick }: RecordButtonProps) {
  return (
    <button className={`rec-btn ${recording ? "recording" : ""}`} disabled={disabled} onClick={onClick} aria-label={recording ? "Stop" : "Record"}>
      <span className="rec-ring" />
      <span className="rec-ring r2" />
      <Icon name={recording ? "stop" : "mic"} fill size={48} />
    </button>
  );
}
