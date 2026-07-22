/**
 * Centralized config: loads + validates environment variables once at startup.
 * Throws early if a required variable is missing — fail-fast, no silent breakage.
 */

import { readFileSync } from "node:fs";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional("PORT", "3003"), 10),
  nodeEnv: optional("NODE_ENV", "development"),
  isProd: optional("NODE_ENV", "production") === "production",

  jwtSecret: required("JWT_SECRET"),
  publicUrl: optional("PUBLIC_URL", "http://localhost:3003"),

  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    adminChatId: required("TELEGRAM_ADMIN_CHAT_ID"),
  },

  firebase: {
    projectId: optional("FIREBASE_PROJECT_ID", "qaztriber"),
    // Service account path or inline JSON. On VPS use GOOGLE_APPLICATION_CREDENTIALS.
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null,
  },
} as const;

/**
 * Loads the Firebase service account credentials.
 * Priority: GOOGLE_APPLICATION_CREDENTIALS file → throws if not set.
 * (Admin SDK also auto-discovers on GCP, but VPS needs explicit path.)
 */
export function loadServiceAccount(): { [k: string]: unknown } {
  const path = config.firebase.credentialsPath;
  if (!path) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS not set. Point it to the service account JSON."
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}
