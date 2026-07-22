import { useAuth } from "../lib/auth";
import { useApp } from "../store";
import { Logo } from "../Logo";

/**
 * Pending approval screen — shown when user is logged in but not yet approved.
 * Real-time: when admin approves (via web or Telegram), the onSnapshot in
 * AuthProvider flips state to "approved" and this screen unmounts automatically.
 */
export function PendingApprovalView() {
  const { t } = useApp();
  const { user, signOut } = useAuth();

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <Logo size={64} variant="mark" />
        <div className="pending-icon" style={{ marginTop: 20 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gold-shimmer, #e6ca65)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <h1 className="gold-text" style={{ marginTop: 16 }}>{t("auth.pendingTitle")}</h1>
        <p className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
          {t("auth.pendingDesc")}
        </p>
        {user?.email && (
          <p className="mono faint" style={{ marginTop: 12, fontSize: 13 }}>{user.email}</p>
        )}
        <button
          className="btn btn-ghost"
          onClick={() => signOut()}
          style={{ marginTop: 24 }}
        >
          {t("auth.logout")}
        </button>
      </div>
    </div>
  );
}
