/**
 * JWT magic-link auth for the admin panel.
 *
 * Flow:
 *   1. Admin sends /login to Telegram bot.
 *   2. Bot calls issueMagicLink() → returns URL with ?token=<jwt>.
 *   3. Admin opens URL → browser hits GET /api/auth/verify?token=<jwt>.
 *   4. Server verifies JWT → sets HttpOnly+Secure cookie → redirects to /.
 *   5. Subsequent API calls carry the cookie; requireAdmin() checks it.
 *
 * Security:
 *   - TTL 1 hour. One-time use: after verify, token jti is blacklisted in-memory
 *     (restart clears it — acceptable since TTL is short and admin is a single person).
 *   - HttpOnly + Secure + SameSite=Lax cookie prevents XSS theft.
 */

import jwt from "jsonwebtoken";
import { config } from "./config.js";

const TTL_SECONDS = 60 * 60; // 1 hour
const COOKIE_NAME = "qzt_admin";

// In-memory one-time-use blacklist (jti → expiry). Cleared on restart.
// For a single-admin panel this is sufficient; restart just invalidates
// unverified links, which is safe (admin re-runs /login).
const usedTokens = new Map<string, number>();

export interface AdminSession {
  chatId: string;
  issuedAt: number;
}

export function issueMagicLink(): string {
  const payload: AdminSession = {
    chatId: config.telegram.adminChatId,
    issuedAt: Date.now(),
  };
  const jti = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: TTL_SECONDS,
    jwtid: jti,
    issuer: "qaztriber-admin",
  });
  return `${config.publicUrl}/api/auth/verify?token=${token}`;
}

export function verifyToken(token: string): AdminSession {
  const decoded = jwt.verify(token, config.jwtSecret, {
    issuer: "qaztriber-admin",
  }) as AdminSession & { jti: string; exp: number };

  // One-time use: reject if already consumed.
  if (usedTokens.has(decoded.jti)) {
    throw new Error("Token already used — request a new magic link via /login");
  }
  usedTokens.set(decoded.jti, decoded.exp * 1000);

  // Opportunistic cleanup of expired entries (keeps map small).
  const now = Date.now();
  for (const [jti, exp] of usedTokens) {
    if (exp < now) usedTokens.delete(jti);
  }

  // Bind to the configured admin chat id — prevents token replay by anyone
  // who somehow obtains the link (e.g. from logs) on a different identity.
  if (decoded.chatId !== config.telegram.adminChatId) {
    throw new Error("Token chat_id mismatch");
  }

  return { chatId: decoded.chatId, issuedAt: decoded.issuedAt };
}

export function verifyCookie(cookieValue: string | undefined): AdminSession | null {
  if (!cookieValue) return null;
  try {
    // Cookie stores a session JWT (separate from magic-link token) — re-sign
    // without jti so it can be used repeatedly within its TTL.
    const decoded = jwt.verify(cookieValue, config.jwtSecret, {
      issuer: "qaztriber-admin",
    }) as AdminSession;
    if (decoded.chatId !== config.telegram.adminChatId) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function issueSessionCookie(): string {
  const payload: AdminSession = {
    chatId: config.telegram.adminChatId,
    issuedAt: Date.now(),
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: TTL_SECONDS,
    issuer: "qaztriber-admin",
  });
}

export { COOKIE_NAME, TTL_SECONDS };
