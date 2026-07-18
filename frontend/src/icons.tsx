// Material Symbols wrapper
import type { CSSProperties } from "react";

export type IconName =
  | "mic" | "description" | "graphic_eq" | "history" | "settings" | "account_circle"
  | "menu" | "check" | "close" | "delete" | "edit" | "share" | "play_arrow" | "pause"
  | "stop" | "arrow_back" | "arrow_forward" | "download" | "upload" | "content_copy"
  | "search" | "more_horiz" | "more_vert" | "check_circle" | "error" | "warning"
  | "info" | "cloud_off" | "cloud_done" | "cloud_download" | "folder" | "folder_open"
  | "schedule" | "timer" | "tune" | "palette" | "translate" | "memory" | "verified"
  | "chevron_right" | "chevron_left" | "add" | "remove" | "refresh" | "save"
  | "waves" | "audio_file" | "graphic_eq" | " Equalizer" | "radio_button_checked"
  | "radio_button_unchecked" | "segment" | "list" | "grid_view" | "filter_list"
  | "sort" | "open_in_new" | "drag_indicator" | "fiber_manual_record" | "task_alt"
  | "do_not_disturb" | "cancel" | "autorenew" | "database" | "storage" | "bolt"
  | "spark" | "workspace_premium" | "shield" | "lock" | "globe" | "language";

interface IconProps {
  name: string;
  size?: number;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, fill = false, className = "", style }: IconProps) {
  const cls = ["ms", fill ? "fill" : "", className].filter(Boolean).join(" ");
  const sizeCls = [14, 16, 18, 20, 24, 28, 32, 48].includes(size) ? ` sz-${size}` : "";
  return (
    <span className={cls + sizeCls} style={style} aria-hidden="true">
      {sizeCls ? name : name}
    </span>
  );
}
