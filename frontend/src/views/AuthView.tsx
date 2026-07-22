import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useApp } from "../store";
import { Logo } from "../Logo";

/**
 * Auth screen — email/password login + Google Sign-In.
 * No anonymous mode (removed per requirements).
 * Design matches the obsidian+gold OnboardingModal style.
 */
export function AuthView() {
  const { t } = useApp();
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      setError(t("auth.errorMinLength"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) await signUpWithEmail(email.trim(), password);
      else await signInWithEmail(email.trim(), password);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/invalid-credential") setError(t("auth.errorInvalid"));
      else if (code === "auth/email-already-in-use") setError(t("auth.errorExists"));
      else if (code === "auth/weak-password") setError(t("auth.errorWeak"));
      else setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Polling completes when auth succeeds — onAuthStateChanged takes over.
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Logo size={64} variant="mark" />
        <h1 className="gold-text" style={{ marginTop: 16 }}>{t("app.name")}</h1>
        <p className="muted" style={{ marginTop: 4 }}>{t("auth.subtitle")}</p>

        <form onSubmit={handleSubmit} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="input"
            type="email"
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            autoComplete="email"
            disabled={loading}
          />
          <input
            className="input"
            type="password"
            placeholder={t("auth.password")}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            disabled={loading}
          />

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-gold" disabled={loading}>
            {loading ? "…" : isSignUp ? t("auth.signup") : t("auth.login")}
          </button>
        </form>

        <button
          className="btn btn-ghost"
          onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
          style={{ marginTop: 8 }}
          disabled={loading}
        >
          {isSignUp ? t("auth.hasAccount") : t("auth.noAccount")}
        </button>

        <div className="auth-divider">
          <span>{t("auth.or")}</span>
        </div>

        <button className="btn btn-soft" onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {loading ? "Ожидание входа в браузере…" : t("auth.google")}
        </button>
      </div>
    </div>
  );
}
