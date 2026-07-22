/**
 * AuthProvider — Firebase Auth gate with admin-approval check.
 *
 * Flow:
 *   loading → !user → AuthView (login/register)
 *   user && !approved → PendingApprovalView (real-time onSnapshot)
 *   user && approved → main app
 *
 * The pending-approval document (users/{uid}) is created by the client on
 * first sign-in. Firestore rules FORCE approved=false on create and deny
 * all client writes afterwards — so the client cannot fake approval.
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getRedirectResult } from "firebase/auth";
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export type AuthState = "loading" | "unauthenticated" | "pending" | "approved";

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  provider: "google" | "email";
}

interface AuthCtx {
  state: AuthState;
  user: AuthUser | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function resolveProvider(user: User): "google" | "email" {
  return user.providerData.some((p) => p.providerId === "google.com") ? "google" : "email";
}

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    provider: resolveProvider(user),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  // Handle the redirect result (fallback when popup fails in WebView)
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          // onAuthStateChanged will pick this up and create the pending doc.
        }
      })
      .catch(() => {});
  }, []);

  // Main auth state listener
  useEffect(() => {
    let unsubDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      // Clean up previous doc listener
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }

      if (!fbUser) {
        setUser(null);
        setState("unauthenticated");
        return;
      }

      const authUser = toAuthUser(fbUser);
      setUser(authUser);
      setState("loading"); // while we check approval

      // Ensure the pending doc exists (create if missing). Firestore rules
      // enforce approved=false on create and reject if doc already exists
      // (idempotent — setDoc with merge would clobber; we use a guard).
      const userRef = doc(db, "users", fbUser.uid);
      try {
        // Try to create — rules will reject if doc already exists (update denied
        // to clients, but create with duplicate id is also denied). We catch
        // and ignore "already exists" — the onSnapshot below handles both cases.
        await setDoc(userRef, {
          uid: fbUser.uid,
          email: fbUser.email ?? "",
          displayName: fbUser.displayName ?? "",
          provider: resolveProvider(fbUser),
          approved: false,
          createdAt: serverTimestamp(),
        });
      } catch {
        // Doc likely already exists (returning user) — expected, continue.
      }

      // Listen for approval status in real-time
      unsubDoc = onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) {
            // Doc not found — still pending (creation may be propagating)
            setState("pending");
            return;
          }
          const data = snap.data();
          if (data.approved === true) {
            setState("approved");
          } else {
            setState("pending");
          }
        },
        () => setState("pending"),
      );
    });

    return () => {
      unsubAuth();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // Tauri WebView blocks popup/redirect OAuth.
    // Solution: open VPS-hosted page in system browser, then poll for token.
    const baseUrl = "https://qaztribber.aidi-lab.kz/admin";

    // Step 1: start session
    let startResp: Response;
    try {
      startResp = await fetch(`${baseUrl}/api/auth/google/start`, { method: "POST" });
    } catch {
      throw new Error("Не удалось подключиться к серверу авторизации");
    }
    if (!startResp.ok) {
      throw new Error(`Сервер вернул ошибку ${startResp.status}`);
    }
    const { sessionId, authUrl } = await startResp.json() as { sessionId: string; authUrl: string };
    const fullAuthUrl = `${baseUrl}${authUrl}`;

    // Step 2: open in system browser (Tauri WebView blocks OAuth popups)
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(fullAuthUrl);
    } catch {
      window.open(fullAuthUrl, "_blank");
    }

    // Step 3: poll until done (timeout 5 minutes)
    const maxAttempts = 300;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const pollResp = await fetch(`${baseUrl}/api/auth/google/poll?session=${sessionId}`);
        const data = await pollResp.json() as { status: string; customToken?: string; error?: string };
        if (data.status === "done" && data.customToken) {
          const { signInWithCustomToken } = await import("firebase/auth");
          await signInWithCustomToken(auth, data.customToken);
          return;
        }
        if (data.status === "error") {
          throw new Error(data.error || "Ошибка Google Sign-In");
        }
      } catch (e) {
        if ((e as Error).message?.includes("Ошибка Google") || (e as Error).message?.includes("сервером")) throw e;
      }
    }
    throw new Error("Таймаут — вы не завершили вход в браузере за 5 минут");
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  return (
    <Ctx.Provider value={{ state, user, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
