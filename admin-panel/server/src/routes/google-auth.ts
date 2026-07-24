/**
 * Google Sign-In flow for desktop app.
 *
 * Architecture:
 *   1. Desktop opens /auth/google.html?session=ID in system browser (via opener)
 *   2. Page uses Firebase signInWithPopup (works in real browser!)
 *   3. After login → POST /api/auth/google/complete?session=ID { idToken }
 *   4. Server verifies token, creates custom token, stores in memory
 *   5. Desktop polls GET /api/auth/google/poll?session=ID
 *   6. Gets customToken → signInWithCustomToken(auth, customToken)
 */

import { Router } from "express";
import { getAdminAuth } from "../firebase.js";

export const googleAuthRouter = Router();

// In-memory session store: sessionId → { customToken, status, error, createdAt }
const sessions = new Map<string, { customToken?: string; status: "pending" | "done" | "error"; error?: string; createdAt: number }>();

// Cleanup old sessions (older than 10 minutes)
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(id);
  }
}, 60 * 1000);

// POST /api/auth/google/start → creates session, returns sessionId
googleAuthRouter.post("/start", (_req, res) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { status: "pending", createdAt: Date.now() });
  res.json({ sessionId, authUrl: `/google.html?session=${sessionId}` });
});

// POST /api/auth/google/complete?session=ID  { idToken }
// Called by the web page after successful Firebase Google sign-in.
googleAuthRouter.post("/complete", async (req, res) => {
  const sessionId = (req.query.session as string) ?? "";
  const { idToken } = req.body as { idToken?: string };

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }
  if (!idToken) {
    session.status = "error";
    session.error = "Missing idToken";
    res.status(400).json({ error: "Missing idToken" });
    return;
  }

  try {
    // Verify the Firebase ID token (confirms it's a real Firebase user)
    const decoded = await getAdminAuth().verifyIdToken(idToken);

    // Create a custom token for the desktop app to sign in with.
    // Embed provider=google in claims so the desktop client can correctly
    // identify the sign-in method (signInWithCustomToken doesn't populate
    // providerData with google.com — only the custom provider).
    const customToken = await getAdminAuth().createCustomToken(decoded.uid, {
      provider: "google",
    });

    session.status = "done";
    session.customToken = customToken;
    res.json({ ok: true });
  } catch (e) {
    session.status = "error";
    session.error = (e as Error).message;
    res.status(401).json({ error: (e as Error).message });
  }
});

// GET /api/auth/google/poll?session=ID
// Desktop polls this until status is "done" or "error".
googleAuthRouter.get("/poll", (req, res) => {
  const sessionId = (req.query.session as string) ?? "";
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ status: "error", error: "Session not found" });
    return;
  }

  if (session.status === "done") {
    res.json({ status: "done", customToken: session.customToken });
    // Clean up
    sessions.delete(sessionId);
  } else if (session.status === "error") {
    res.json({ status: "error", error: session.error });
    sessions.delete(sessionId);
  } else {
    res.json({ status: "pending" });
  }
});
