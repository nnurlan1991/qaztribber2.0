/**
 * Firebase Admin SDK initialization.
 *
 * Admin SDK bypasses all Firestore rules — this is the ONLY writer to
 * users/{uid}.approved, pendingMessageId, approvedBy, etc. Clients
 * (desktop app) cannot write these fields (enforced by firestore.rules).
 */

import { initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { config, loadServiceAccount } from "./config.js";

let app: App;
let auth: Auth;
let db: Firestore;

export function initFirebase(): void {
  const serviceAccount = loadServiceAccount();

  app = initializeApp(
    {
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      projectId: config.firebase.projectId,
    },
    "qaztriber-admin"
  );

  auth = getAuth(app);
  db = getFirestore(app);
  // Note: do NOT set preferRest:true — it breaks onSnapshot real-time listeners.
  // Default gRPC transport is required for the Telegram bot's Firestore watchers.
}

export function getDb(): Firestore {
  if (!db) throw new Error("Firebase not initialized — call initFirebase() first");
  return db;
}

export function getAdminAuth(): Auth {
  if (!auth) throw new Error("Firebase not initialized — call initFirebase() first");
  return auth;
}

export const USERS_COLLECTION = "users";
