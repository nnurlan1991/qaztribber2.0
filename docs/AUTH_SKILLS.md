# SKILL: Firebase Auth + Admin-Approval Gate for Desktop Apps

> Production-ready architecture for Tauri/Electron desktop apps that need user
> authentication, admin approval workflow, and Google Sign-In — all without
> Cloud Functions (works on Firebase Spark/free plan).

## When to Use

- Desktop app (Tauri, Electron) needing user accounts
- Admin must approve users before they access the app
- Google Sign-In needed (but WebView blocks OAuth popups)
- Telegram bot for instant approve/reject notifications
- Whitelist for bulk pre-approval (Excel/CSV import)
- No Cloud Functions (free Firebase plan)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  DESKTOP APP (Tauri/React)                               │
│  ┌───────────────┐   ┌──────────────────────────────┐    │
│  │ Firebase Auth  │   │ Firestore users/{uid}        │    │
│  │ (email/Google) │   │ onSnapshot → approved?       │    │
│  └──────┬────────┘   └──────────────┬───────────────┘    │
│         │                           │                     │
│  ┌──────▼───────────────────────────▼───────────────┐    │
│  │ AuthProvider: loading→unauth→pending→approved    │    │
│  └──────────────────────────────────────────────────┘    │
│         │                                                │
│         │ Google Sign-In: opens system browser           │
│         │ (WebView blocks popups, so delegate)           │
└─────────┼────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  VPS (Express + Firebase Admin SDK)                      │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │ Admin Panel UI │  │ Telegram Bot │  │ google.html │   │
│  │ (web, JWT auth)│  │ (polling 5s) │  │ (Firebase   │   │
│  │                │  │              │  │  signIn)    │   │
│  └───────┬────────┘  └──────┬───────┘  └──────┬──────┘   │
│          │                  │                  │          │
│          ▼                  ▼                  ▼          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Firebase Admin SDK (bypasses Firestore rules)        ││
│  │  - approveUser / revokeUser / deleteUser             ││
│  │  - verifyIdToken → createCustomToken                 ││
│  │  - whitelist CRUD + bulk import                      ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  Firestore (single source of truth)                      │
│  ┌─────────────────┐  ┌─────────────────────┐            │
│  │ users/{uid}     │  │ whitelist/{email}   │            │
│  │  approved: bool │  │  email, addedAt     │            │
│  │  email, provider│  │  source: manual|excel│           │
│  └─────────────────┘  └─────────────────────┘            │
│  Rules: client can create (approved=false only),         │
│  read own doc. NO update/delete. Admin SDK bypasses.     │
└─────────────────────────────────────────────────────────┘
```

## Core Principles

### 1. Rules-Enforced Approval (No Cloud Functions)
Client creates `users/{uid}` on first login with `approved: false`. Firestore rules **force** `approved == false` on create and **deny** all client updates. Only Admin SDK (VPS) can set `approved: true`. This eliminates fake-approve on the free plan.

### 2. Google Sign-In via System Browser
Tauri/Electron WebViews block OAuth popups. Solution: open a VPS-hosted `google.html` in the system browser → Firebase `signInWithPopup` works → send `idToken` to VPS → VPS creates `customToken` → desktop polls → `signInWithCustomToken`.

### 3. Polling Over onSnapshot (VPS)
`onSnapshot` (gRPC) is unstable under pm2. Use 5-second polling queries to Firestore instead. In-memory state tracks which users have pending Telegram messages.

### 4. Single Source of Truth
Firestore `users/{uid}` is the only truth. Both web admin and Telegram bot write via Admin SDK. Polling sync detects changes from either channel and updates Telegram messages accordingly.

### 5. Telegram Bot as Mobile Admin
Bot sends inline-keyboard messages (Approve/Reject/Revoke) for each pending user. Admin can act from phone instantly. Bot also serves magic-link login for the web admin panel.

---

## Step-by-Step Implementation

### Phase 1: Firebase Project Setup

1. **Create Firebase project** at console.firebase.google.com
2. **Enable Email/Password and Google sign-in providers**:
   - Authentication → Sign-in method → Email/Password → Enable
   - Authentication → Sign-in method → Google → Enable → Save
3. **Add authorized domains**:
   - Authentication → Settings → Authorized domains
   - Add your VPS domain (e.g., `yourapp.example.com`)
   - Add `tauri.localhost` (for Tauri dev)
4. **Create web app** → copy config (apiKey, authDomain, etc.)
5. **Create service account**:
   - Project Settings → Service Accounts → Generate New Private Key
   - Save JSON — this goes on the VPS only (NEVER in client code)
6. **Deploy Firestore rules** (see below)

### Phase 2: Firestore Rules

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      // Client reads only own doc (for onSnapshot approval status)
      allow read: if request.auth != null && request.auth.uid == uid;

      // Create: only owner, ONLY with approved=false
      // Validate email == auth token email, provider whitelist,
      // and reject admin-only fields (approvedAt, approvedBy, etc.)
      allow create: if request.auth != null
        && request.auth.uid == uid
        && request.resource.data.approved == false
        && request.resource.data.email is string
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.provider is string
        && (request.resource.data.provider == "google"
            || request.resource.data.provider == "email")
        && request.resource.data.displayName is string
        && request.resource.data.uid is string
        && request.resource.data.uid == uid
        && request.resource.data.createdAt is timestamp
        && !('approvedAt' in request.resource.data.keys())
        && !('approvedBy' in request.resource.data.keys())
        && !('pendingMessageId' in request.resource.data.keys())
        && !('revokedAt' in request.resource.data.keys())
        && !('isAdmin' in request.resource.data.keys());

      // No client updates or deletes — Admin SDK only
      allow update, delete: if false;
    }

    // Whitelist: client cannot read or write (Admin SDK only)
    match /whitelist/{email} {
      allow read, write: if false;
    }

    // Default deny
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Deploy: `firebase deploy --only firestore:rules`

### Phase 3: Desktop Frontend (React/Tauri)

#### firebase.ts — Client SDK init
```typescript
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "...",        // Public — security comes from rules, not key secrecy
  authDomain: "....firebaseapp.com",
  projectId: "...",
  storageBucket: "....firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

#### auth.tsx — AuthProvider with approval gate
```typescript
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export type AuthState = "loading" | "unauthenticated" | "pending" | "approved";

interface AuthCtx {
  state: AuthState;
  user: { uid: string; email: string; displayName: string; provider: "google" | "email" } | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function resolveProvider(user: User): "google" | "email" {
  return user.providerData.some((p) => p.providerId === "google.com") ? "google" : "email";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const [user, setUser] = useState<AuthCtx["user"]>(null);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }

      if (!fbUser) {
        setUser(null);
        setState("unauthenticated");
        return;
      }

      setUser({
        uid: fbUser.uid,
        email: fbUser.email ?? "",
        displayName: fbUser.displayName ?? "",
        provider: resolveProvider(fbUser),
      });
      setState("loading");

      // Create pending doc (rules enforce approved=false)
      const userRef = doc(db, "users", fbUser.uid);
      try {
        await setDoc(userRef, {
          uid: fbUser.uid,
          email: fbUser.email ?? "",
          displayName: fbUser.displayName ?? "",
          provider: resolveProvider(fbUser),
          approved: false,
          createdAt: serverTimestamp(),
        });
      } catch {
        // Doc already exists (returning user) — expected
      }

      // Listen for approval status
      unsubDoc = onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) { setState("pending"); return; }
          setState(snap.data().approved === true ? "approved" : "pending");
        },
        () => setState("pending"),  // On error, default to pending (safer)
      );
    });

    return () => { unsubAuth(); if (unsubDoc) unsubDoc(); };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  // ─── Google Sign-In via system browser ───
  const signInWithGoogle = useCallback(async () => {
    const baseUrl = "https://yourapp.example.com/admin";

    // Step 1: create session on VPS
    const startResp = await fetch(`${baseUrl}/api/auth/google/start`, { method: "POST" });
    const { sessionId, authUrl } = await startResp.json();
    const fullAuthUrl = `${baseUrl}${authUrl}`;

    // Step 2: open in system browser (WebView blocks popups)
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(fullAuthUrl);
    } catch {
      window.open(fullAuthUrl, "_blank");
    }

    // Step 3: poll for custom token (timeout 5 min)
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollResp = await fetch(`${baseUrl}/api/auth/google/poll?session=${sessionId}`);
      const data = await pollResp.json();
      if (data.status === "done" && data.customToken) {
        const { signInWithCustomToken } = await import("firebase/auth");
        await signInWithCustomToken(auth, data.customToken);
        return;
      }
      if (data.status === "error") throw new Error(data.error);
    }
    throw new Error("Timeout — login not completed in 5 minutes");
  }, []);

  const signOut = useCallback(async () => { await fbSignOut(auth); }, []);

  return (
    <Ctx.Provider value={{ state, user, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

#### App.tsx — Auth gate
```tsx
function App() {
  const { state } = useAuth();

  if (state === "loading") return <LoadingScreen />;
  if (state === "unauthenticated") return <AuthView />;
  if (state === "pending") return <PendingApprovalView />;

  return <MainApp />;
}
```

#### Tauri config — CSP + Opener plugin

In `src-tauri/Cargo.toml`:
```toml
tauri-plugin-opener = "2"
```

In `src-tauri/capabilities/default.json`:
```json
{
  "permissions": [
    "opener:default",
    "opener:allow-open-url"
  ]
}
```

In `src-tauri/tauri.conf.json` (CSP must allow Firebase + VPS):
```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://yourapp.example.com; img-src 'self' data: https:"
    }
  }
}
```

### Phase 4: VPS Admin Panel (Express + Admin SDK)

#### config.ts — Environment validation
```typescript
import { readFileSync } from "node:fs";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3003", 10),
  jwtSecret: required("JWT_SECRET"),
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:3003",
  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    adminChatId: required("TELEGRAM_ADMIN_CHAT_ID"),
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? "your-project",
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null,
  },
} as const;

export function loadServiceAccount() {
  const path = config.firebase.credentialsPath;
  if (!path) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");
  return JSON.parse(readFileSync(path, "utf8"));
}
```

#### firebase.ts — Admin SDK init
```typescript
import { initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { config, loadServiceAccount } from "./config.js";

let app: App, auth: Auth, db: Firestore;

export function initFirebase(): void {
  app = initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: config.firebase.projectId,
  }, "admin");
  auth = getAuth(app);
  db = getFirestore(app);
  // Do NOT set preferRest:true — breaks onSnapshot
}

export const getDb = () => db;
export const getAdminAuth = () => auth;
export const USERS_COLLECTION = "users";
export const WHITELIST_COLLECTION = "whitelist";
```

#### auth.ts — JWT magic-link for admin panel
```typescript
import jwt from "jsonwebtoken";
import { config } from "./config.js";

const TTL = 3600; // 1 hour
const COOKIE_NAME = "admin_session";
const usedTokens = new Map<string, number>(); // One-time use blacklist

export function issueMagicLink(): string {
  const jti = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const token = jwt.sign(
    { chatId: config.telegram.adminChatId, issuedAt: Date.now() },
    config.jwtSecret,
    { expiresIn: TTL, jwtid: jti, issuer: "admin-panel" }
  );
  return `${config.publicUrl}/api/auth/verify?token=${token}`;
}

export function verifyToken(token: string) {
  const decoded = jwt.verify(token, config.jwtSecret, { issuer: "admin-panel" }) as any;
  if (usedTokens.has(decoded.jti)) throw new Error("Token already used");
  usedTokens.set(decoded.jti, decoded.exp * 1000);
  if (decoded.chatId !== config.telegram.adminChatId) throw new Error("Chat ID mismatch");
  return { chatId: decoded.chatId, issuedAt: decoded.issuedAt };
}

export function issueSessionCookie(): string {
  return jwt.sign(
    { chatId: config.telegram.adminChatId, issuedAt: Date.now() },
    config.jwtSecret,
    { expiresIn: TTL, issuer: "admin-panel" }
  );
}

export function verifyCookie(val: string | undefined) {
  if (!val) return null;
  try {
    const decoded = jwt.verify(val, config.jwtSecret, { issuer: "admin-panel" }) as any;
    if (decoded.chatId !== config.telegram.adminChatId) return null;
    return { chatId: decoded.chatId, issuedAt: decoded.issuedAt };
  } catch { return null; }
}

export { COOKIE_NAME, TTL };
```

#### userService.ts — Shared approve/revoke/delete (idempotent)
```typescript
import { FieldValue } from "firebase-admin/firestore";
import { getDb, getAdminAuth, USERS_COLLECTION } from "./firebase.js";

export interface UserDoc {
  uid: string; email: string; displayName: string; provider: string;
  approved: boolean; createdAt?: any; approvedAt?: any; approvedBy?: string;
  pendingMessageId?: number | null; revokedAt?: any;
}

// Idempotent: if already approved, returns current state without re-writing
export async function approveUser(uid: string, approvedBy: string) {
  const ref = getDb().collection(USERS_COLLECTION).doc(uid);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("User not found");
  const u = doc.data() as UserDoc;
  if (u.approved) return u;
  await ref.update({
    approved: true,
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy,
    revokedAt: null,
  });
  return (await ref.get()).data() as UserDoc;
}

export async function revokeUser(uid: string) {
  const ref = getDb().collection(USERS_COLLECTION).doc(uid);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("User not found");
  const u = doc.data() as UserDoc;
  if (!u.approved) return u;
  await ref.update({
    approved: false,
    revokedAt: FieldValue.serverTimestamp(),
    approvedAt: null,
    approvedBy: null,
  });
  return (await ref.get()).data() as UserDoc;
}

export async function deleteUser(uid: string) {
  await getDb().collection(USERS_COLLECTION).doc(uid).delete();
  try { await getAdminAuth().deleteUser(uid); } catch { /* best-effort */ }
}
```

#### whitelistService.ts — Pre-approved emails + auto-approve
```typescript
import { FieldValue } from "firebase-admin/firestore";
import { getDb, USERS_COLLECTION, WHITELIST_COLLECTION } from "./firebase.js";

function normalize(email: string) { return email.trim().toLowerCase(); }

export async function isWhitelisted(email: string) {
  if (!email) return false;
  const doc = await getDb().collection(WHITELIST_COLLECTION).doc(normalize(email)).get();
  return doc.exists;
}

export async function addWhitelistEntry(email: string, addedBy: string, source: "manual" | "excel" = "manual") {
  const normalized = normalize(email);
  if (!normalized.includes("@")) throw new Error(`Invalid email: ${email}`);
  const ref = getDb().collection(WHITELIST_COLLECTION).doc(normalized);
  if ((await ref.get()).exists) return { created: false, email: normalized };
  await ref.set({ email: normalized, addedAt: FieldValue.serverTimestamp(), addedBy, source });
  return { created: true, email: normalized };
}

export async function importWhitelist(emails: string[], addedBy: string) {
  let added = 0, skipped = 0, invalid = 0;
  for (const raw of emails) {
    const email = normalize(raw);
    if (!email.includes("@") || email.length < 5) { invalid++; continue; }
    try {
      const r = await addWhitelistEntry(email, addedBy, "excel");
      r.created ? added++ : skipped++;
    } catch { invalid++; }
  }
  return { added, skipped, invalid, total: emails.length };
}

// Auto-approve: called from polling loop for each pending user
export async function autoApproveIfWhitelisted(uid: string, email: string) {
  if (!email || !(await isWhitelisted(email))) return false;
  const ref = getDb().collection(USERS_COLLECTION).doc(uid);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.approved === true) return false;
  await ref.update({
    approved: true, approvedAt: FieldValue.serverTimestamp(),
    approvedBy: "whitelist-auto", revokedAt: null,
  });
  return true;
}
```

#### google-auth.ts — Google Sign-In relay (desktop ↔ browser)
```typescript
import { Router } from "express";
import { getAdminAuth } from "./firebase.js";

export const googleAuthRouter = Router();

// In-memory sessions: sessionId → { customToken, status, error, createdAt }
const sessions = new Map<string, { customToken?: string; status: string; error?: string; createdAt: number }>();

// Cleanup sessions older than 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 600000;
  for (const [id, s] of sessions) if (s.createdAt < cutoff) sessions.delete(id);
}, 60000);

// POST /api/auth/google/start — desktop calls this to create a session
googleAuthRouter.post("/start", (_req, res) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { status: "pending", createdAt: Date.now() });
  res.json({ sessionId, authUrl: `/google.html?session=${sessionId}` });
});

// POST /api/auth/google/complete?session=ID — google.html calls this with idToken
googleAuthRouter.post("/complete", async (req, res) => {
  const sessionId = req.query.session as string;
  const session = sessions.get(sessionId);
  if (!session) { res.status(404).json({ error: "Session not found or expired" }); return; }
  const { idToken } = req.body;
  if (!idToken) { res.status(400).json({ error: "Missing idToken" }); return; }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const customToken = await getAdminAuth().createCustomToken(decoded.uid);
    session.status = "done";
    session.customToken = customToken;
    res.json({ ok: true });
  } catch (e) {
    session.status = "error";
    session.error = (e as Error).message;
    res.status(401).json({ error: (e as Error).message });
  }
});

// GET /api/auth/google/poll?session=ID — desktop polls until done/error
googleAuthRouter.get("/poll", (req, res) => {
  const session = sessions.get(req.query.session as string);
  if (!session) { res.status(404).json({ status: "error", error: "Session not found" }); return; }
  if (session.status === "done") {
    res.json({ status: "done", customToken: session.customToken });
    sessions.delete(req.query.session as string);
  } else if (session.status === "error") {
    res.json({ status: "error", error: session.error });
    sessions.delete(req.query.session as string);
  } else {
    res.json({ status: "pending" });
  }
});
```

#### telegram-bot.ts — Mobile admin with polling sync
```typescript
import TelegramBot from "node-telegram-bot-api";
import { config } from "./config.js";
import { getDb, USERS_COLLECTION } from "./firebase.js";
import { issueMagicLink } from "./auth.js";
import { approveUser, revokeUser, deleteUser, getUser, type UserDoc } from "./userService.js";
import { autoApproveIfWhitelisted } from "./whitelistService.js";

let bot: TelegramBot;
let started = false;

// ALWAYS escape user data in Telegram HTML messages
function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// In-memory state for polling sync
const seenPending = new Set<string>();
const seenApproved = new Set<string>();

export function startBot(): void {
  if (started) return;
  started = true;
  bot = new TelegramBot(config.telegram.botToken, { polling: true });

  // Commands: /start, /login, /stats, /pending
  bot.onText(/^\/login/, (msg) => {
    if (msg.chat.id.toString() !== config.telegram.adminChatId) return;
    bot.sendMessage(msg.chat.id, "Link:\n" + issueMagicLink(), { disable_web_page_preview: true });
  });

  // Inline buttons: approve / reject / revoke
  bot.on("callback_query", async (q) => {
    if (q.from.id.toString() !== config.telegram.adminChatId) return;
    const [action, uid] = (q.data ?? "").split(":");
    try {
      if (action === "app") {
        await approveUser(uid, "telegram");
        bot.answerCallbackQuery(q.id, { text: "Approved" });
      } else if (action === "rej") {
        const u = await getUser(uid);
        if (u) await editToRejected(u);
        await deleteUser(uid);
        bot.answerCallbackQuery(q.id, { text: "Deleted" });
      } else if (action === "rev") {
        await revokeUser(uid);
        bot.answerCallbackQuery(q.id, { text: "Revoked" });
      }
    } catch (e) { bot.answerCallbackQuery(q.id, { text: (e as Error).message }); }
  });

  // Polling sync every 5s (replaces onSnapshot — gRPC unstable under pm2)
  setInterval(async () => {
    try {
      await pollPending();
      await pollApproved();
    } catch (e) { console.error("[bot] poll error:", e); }
  }, 5000);

  console.log("[bot] started");
}

async function pollPending() {
  const snap = await getDb().collection(USERS_COLLECTION).where("approved", "==", false).get();
  for (const doc of snap.docs) {
    const u = doc.data() as UserDoc;
    // Auto-approve if whitelisted
    if (u.email && await autoApproveIfWhitelisted(u.uid, u.email).catch(() => false)) {
      seenPending.delete(u.uid);
      continue;
    }
    if (u.pendingMessageId) {
      if (!seenPending.has(u.uid) || seenApproved.has(u.uid)) {
        seenApproved.delete(u.uid);
        seenPending.add(u.uid);
        await editToPending(u).catch(() => {});
      }
    } else if (!seenPending.has(u.uid)) {
      seenPending.add(u.uid);
      await sendPendingMessage(u).catch(() => {});
    }
  }
}

async function pollApproved() {
  const snap = await getDb().collection(USERS_COLLECTION).where("approved", "==", true).get();
  for (const doc of snap.docs) {
    const u = doc.data() as UserDoc;
    if (u.pendingMessageId && seenPending.has(u.uid) && !seenApproved.has(u.uid)) {
      seenApproved.add(u.uid);
      seenPending.delete(u.uid);
      await editToApproved(u).catch(() => {});
    }
    seenApproved.add(u.uid);
  }
}

async function sendPendingMessage(u: UserDoc) {
  const sent = await bot.sendMessage(config.telegram.adminChatId, pendingText(u), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[
      { text: "Approve", callback_data: `app:${u.uid}` },
      { text: "Reject", callback_data: `rej:${u.uid}` },
    ]] },
  });
  await getDb().collection(USERS_COLLECTION).doc(u.uid)
    .set({ pendingMessageId: sent.message_id }, { merge: true });
}
```

#### google.html — VPS-hosted Google Sign-In page
```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Sign in with Google</title></head>
<body>
  <button id="googleBtn">Sign in with Google</button>
  <div id="status"></div>

  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
    import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

    const app = initializeApp({ /* your firebase config */ });
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    // Handle redirect result (page reload after OAuth redirect)
    getRedirectResult(auth).then(result => {
      if (result?.user) completeLogin(result.user);
    }).catch(err => {
      document.getElementById('status').textContent = 'Error: ' + err.message;
    });

    window.startGoogleLogin = async function() {
      try {
        const result = await signInWithPopup(auth, provider);
        await completeLogin(result.user);
      } catch (err) {
        // Fallback: redirect if popup fails
        if (['auth/popup-blocked','auth/internal-error','auth/popup-closed-by-user'].includes(err.code)) {
          await signInWithRedirect(auth, provider);
        } else {
          document.getElementById('status').textContent = 'Error: ' + err.message;
        }
      }
    };

    async function completeLogin(user) {
      const idToken = await user.getIdToken();
      const sessionId = new URLSearchParams(location.search).get('session');
      const resp = await fetch('/admin/api/auth/google/complete?session=' + sessionId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (resp.ok) {
        document.getElementById('status').innerHTML = '✓ Done! Return to the app.';
      } else {
        const data = await resp.json();
        document.getElementById('status').textContent = 'Error: ' + data.error;
      }
    }
  </script>
</body>
</html>
```

#### index.ts — Express server with per-route CSP
```typescript
import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import { initFirebase } from "./firebase.js";
import { verifyCookie, COOKIE_NAME } from "./auth.js";
import { startBot } from "./telegram-bot.js";
import { googleAuthRouter } from "./routes/google-auth.js";
// ... other routers

initFirebase();
startBot();

const app = express();
app.use(express.json());
app.use(cookieParser());

// Per-route CSP: strict everywhere EXCEPT google.html
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.path.includes("google.html")) {
    // Relaxed CSP: Firebase SDK from gstatic.com + Google APIs
    res.setHeader("Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com https://apis.google.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://accounts.google.com; " +
      "frame-src https://*.firebaseapp.com https://accounts.google.com; " +
      "img-src 'self' data: https:"
    );
  } else {
    res.setHeader("Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'"
    );
  }
  next();
});

app.set("trust proxy", 1); // nginx

// Admin session middleware
app.use((req, _res, next) => {
  req.adminSession = verifyCookie(req.cookies?.[COOKIE_NAME]) ?? undefined;
  next();
});

// Google auth routes need CORS (desktop fetches cross-origin)
app.use(["/api/auth/google", "/admin/api/auth/google"], (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
}, googleAuthRouter);

// Protected routes
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.adminSession) { res.status(401).json({ error: "Not authorized" }); return; }
  next();
}
app.use(["/api/users", "/admin/api/users"], requireAdmin, usersRouter);
app.use(["/api/stats", "/admin/api/stats"], requireAdmin, statsRouter);
app.use(["/api/whitelist", "/admin/api/whitelist"], requireAdmin, whitelistRouter);

// Static frontend
app.use("/admin", express.static(webDir));
app.get(["/admin/google.html", "/google.html"], (_req, res) => {
  res.sendFile(path.join(webDir, "google.html"));
});

app.listen(3003, () => console.log("Server on :3003"));
```

### Phase 5: VPS Deployment

#### nginx config
```nginx
location /admin {
    proxy_pass http://127.0.0.1:3003;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

#### pm2 ecosystem.config.cjs
```javascript
module.exports = {
  apps: [{
    name: "yourapp-admin",
    script: "server/dist/index.js",
    cwd: "/home/user/projects/yourapp-admin",
    env: {
      NODE_ENV: "production",
      PORT: "3003",
      PUBLIC_URL: "https://yourapp.example.com",
      JWT_SECRET: "your-long-random-secret",
      TELEGRAM_BOT_TOKEN: "your-bot-token",
      TELEGRAM_ADMIN_CHAT_ID: "your-chat-id",
      FIREBASE_PROJECT_ID: "your-project",
      GOOGLE_APPLICATION_CREDENTIALS: "/home/user/.config/yourapp/firebase-service-account.json",
    },
  }],
};
```

#### Deploy commands
```bash
# Build server
cd admin-panel/server && npm run build

# Upload to VPS
scp -i ~/.ssh/key dist/index.js user@vps:/home/user/projects/yourapp-admin/server/dist/
scp -i ~/.ssh/key -r ../web user@vps:/home/user/projects/yourapp-admin/

# Restart
ssh -i ~/.ssh/key user@vps "pm2 restart yourapp-admin"
```

### Phase 6: Telegram Bot Setup

1. Create bot via [@BotFather](https://t.me/BotFather)
2. Get bot token
3. Get your chat ID: send any message to bot, then `curl https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Set bot token + chat_id in pm2 env

---

## Critical Gotchas & Lessons Learned

### 1. CSP Blocks Firebase SDK on google.html
**Problem:** Server's default CSP `script-src 'self'` blocks Firebase ESM SDK from `gstatic.com`.
**Fix:** Per-route CSP — relaxed only for `google.html`, strict everywhere else.

### 2. CSP Must Include `apis.google.com`
**Problem:** Firebase Auth internally loads `https://apis.google.com/js/api.js` for OAuth.
**Fix:** Add `https://apis.google.com` to `script-src` in google.html's CSP.

### 3. Google Sign-In Provider Must Be Enabled
**Problem:** `auth/internal-error` on `signInWithPopup`.
**Cause:** Google sign-in provider not enabled in Firebase Console (not just email).
**Fix:** Firebase Console → Authentication → Sign-in method → Google → Enable.

### 4. Authorized Domains Must Include VPS Domain
**Problem:** `auth/internal-error` on custom domain.
**Fix:** Firebase Console → Authentication → Settings → Authorized domains → add your VPS domain.

### 5. onSnapshot Unstable Under pm2
**Problem:** gRPC connections drop under pm2, causing missed real-time updates.
**Fix:** Replace `onSnapshot` in the VPS bot with 5-second polling queries.

### 6. Polling Instead of SSE for Desktop
**Problem:** EventSource/SSE unreliable in Tauri WebView.
**Fix:** Use `setTimeout`-based polling every 500ms-1s for job status and auth polling.

### 7. In-Memory Sessions Lost on Server Restart
**Problem:** Google auth sessions stored in memory → lost on pm2 restart during debugging.
**Fix:** Acceptable for production. During development, avoid restarting while testing.

### 8. CORS Required for Google Auth Endpoints
**Problem:** Desktop app (localhost/tauri://) fetches VPS google-auth endpoints cross-origin.
**Fix:** Set `Access-Control-Allow-Origin: *` specifically on `/api/auth/google/*` routes.

### 9. Telegram HTML Injection
**Problem:** User emails/names could contain HTML that breaks bot messages.
**Fix:** `escapeHtmlTelegram()` on ALL user-provided data before inserting in HTML messages.

### 10. Idempotent Approve/Revoke
**Problem:** Race conditions between web admin and Telegram bot approving simultaneously.
**Fix:** Each operation re-reads the doc before writing. If already in target state, return without writing.

### 11. Firebase API Key Is Public — Security from Rules
**Problem:** Concern about API key in client code.
**Fact:** Firebase API keys are designed to be public. Security comes from Firestore rules (client can only create with `approved=false`, no updates) and Admin SDK (server-side, bypasses rules).

### 12. Tauri Opener Plugin
**Problem:** `window.open()` doesn't work in Tauri WebView.
**Fix:** Use `@tauri-apps/plugin-opener` → `openUrl()` to launch the system browser.

---

## File Structure

```
project/
├── frontend/src/
│   ├── lib/
│   │   ├── firebase.ts          # Client SDK init
│   │   └── auth.tsx             # AuthProvider, Google Sign-In polling
│   ├── views/
│   │   ├── AuthView.tsx         # Login/register screen
│   │   └── PendingApprovalView.tsx
│   └── App.tsx                  # Auth gate
├── admin-panel/
│   ├── server/src/
│   │   ├── index.ts             # Express entry, CSP, routing
│   │   ├── config.ts            # Env validation
│   │   ├── firebase.ts          # Admin SDK init
│   │   ├── auth.ts              # JWT magic-link
│   │   ├── userService.ts       # Approve/revoke/delete (idempotent)
│   │   ├── whitelistService.ts  # Whitelist CRUD + auto-approve
│   │   ├── telegram-bot.ts      # Bot + polling sync
│   │   └── routes/
│   │       ├── auth.ts          # Magic-link verify/me/logout
│   │       ├── google-auth.ts   # start/complete/poll
│   │       ├── users.ts         # List/approve/revoke/delete
│   │       ├── stats.ts         # Dashboard stats
│   │       └── whitelist.ts     # Whitelist CRUD + import
│   └── web/
│       ├── index.html           # Admin panel UI
│       └── google.html          # Google Sign-In page (relaxed CSP)
├── firestore.rules              # Security rules
└── src-tauri/
    ├── Cargo.toml               # tauri-plugin-opener
    ├── capabilities/default.json # opener permissions
    └── tauri.conf.json          # CSP with Firebase domains
```

---

## Checklist for New Project

- [ ] Create Firebase project, enable Email + Google providers
- [ ] Add authorized domains (VPS domain + `tauri.localhost`)
- [ ] Generate service account JSON, deploy to VPS
- [ ] Deploy Firestore rules (client create with `approved=false`, no update)
- [ ] Desktop: `firebase.ts`, `auth.tsx` (AuthProvider with 4 states)
- [ ] Desktop: `tauri.conf.json` CSP includes Firebase + VPS domains
- [ ] Desktop: `tauri-plugin-opener` in Cargo.toml + capabilities
- [ ] VPS: Express server with Admin SDK, JWT auth, per-route CSP
- [ ] VPS: `google.html` with Firebase ESM SDK (relaxed CSP)
- [ ] VPS: google-auth routes (start/complete/poll) with CORS
- [ ] VPS: userService (idempotent approve/revoke/delete)
- [ ] VPS: whitelistService (CRUD + bulk import + auto-approve)
- [ ] VPS: Telegram bot with polling sync (5s interval)
- [ ] VPS: nginx proxy + SSL
- [ ] VPS: pm2 with env vars (JWT_SECRET, bot token, service account path)
- [ ] Test: email registration → pending → admin approve → app access
- [ ] Test: Google Sign-In → system browser → custom token → app access
- [ ] Test: whitelist import → new user auto-approved
- [ ] Test: revoke → user loses access on next onSnapshot
