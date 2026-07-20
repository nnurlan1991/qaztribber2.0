// Browser Notification API — works in Tauri webview without capabilities
// Falls back silently in non-Tauri contexts (dev browser)

let permissionChecked = false;
let permissionGranted = false;

async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) return permissionGranted;
  if (!("Notification" in window)) {
    permissionChecked = true;
    return false;
  }
  try {
    if (Notification.permission === "granted") {
      permissionGranted = true;
    } else if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      permissionGranted = permission === "granted";
    }
    permissionChecked = true;
    return permissionGranted;
  } catch {
    permissionChecked = true;
    return false;
  }
}

export async function requestNotificationPermission(): Promise<void> {
  await ensurePermission();
}

export async function notifyJobComplete(
  _jobId: string,
  _status: string,
  title: string,
  body: string,
): Promise<void> {
  const granted = await ensurePermission();
  if (!granted) return;
  try {
    const notification = new Notification(title, {
      body,
    });
    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  } catch (error) {
    console.warn("Notification failed:", error);
  }
}
