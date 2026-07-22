/**
 * Whitelist service — manage pre-approved emails.
 *
 * Firestore collection: whitelist/{email}
 *   { email, addedAt, addedBy, source: "manual" | "excel" }
 *
 * When a new user registers, the Telegram bot polling checks if their email
 * is in the whitelist → auto-approves without admin action.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getDb, USERS_COLLECTION } from "./firebase.js";

export const WHITELIST_COLLECTION = "whitelist";

export interface WhitelistEntry {
  email: string;
  addedAt?: { toDate?: () => Date } | null;
  addedBy: string;
  source: "manual" | "excel";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Get all whitelist entries, sorted by addedAt desc. */
export async function listWhitelist(): Promise<WhitelistEntry[]> {
  const snap = await getDb()
    .collection(WHITELIST_COLLECTION)
    .orderBy("addedAt", "desc")
    .get();
  const out: WhitelistEntry[] = [];
  snap.forEach((d) => out.push(d.data() as WhitelistEntry));
  return out;
}

/** Check if an email is whitelisted (used by auto-approve logic). */
export async function isWhitelisted(email: string): Promise<boolean> {
  if (!email) return false;
  const doc = await getDb()
    .collection(WHITELIST_COLLECTION)
    .doc(normalizeEmail(email))
    .get();
  return doc.exists;
}

/** Add a single email to whitelist. Idempotent — skips if already exists. */
export async function addWhitelistEntry(email: string, addedBy: string, source: "manual" | "excel" = "manual"): Promise<{ created: boolean; email: string }> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new Error(`Некорректный email: ${email}`);
  }

  const ref = getDb().collection(WHITELIST_COLLECTION).doc(normalized);
  const doc = await ref.get();
  if (doc.exists) {
    return { created: false, email: normalized };
  }

  await ref.set({
    email: normalized,
    addedAt: FieldValue.serverTimestamp(),
    addedBy,
    source,
  });
  return { created: true, email: normalized };
}

/** Bulk add emails (from Excel/CSV import). Returns stats. */
export async function importWhitelist(emails: string[], addedBy: string): Promise<{ added: number; skipped: number; invalid: number; total: number }> {
  let added = 0;
  let skipped = 0;
  let invalid = 0;

  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email || !email.includes("@") || email.length < 5) {
      invalid++;
      continue;
    }
    try {
      const result = await addWhitelistEntry(email, addedBy, "excel");
      if (result.created) added++;
      else skipped++;
    } catch {
      invalid++;
    }
  }

  return { added, skipped, invalid, total: emails.length };
}

/** Remove email from whitelist. */
export async function removeWhitelistEntry(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  await getDb().collection(WHITELIST_COLLECTION).doc(normalized).delete();
}

/**
 * Auto-approve: if a pending user's email is in the whitelist,
 * approve them automatically. Called from the polling loop.
 * Returns true if auto-approved.
 */
export async function autoApproveIfWhitelisted(uid: string, email: string): Promise<boolean> {
  if (!email) return false;
  const whitelisted = await isWhitelisted(email);
  if (!whitelisted) return false;

  const ref = getDb().collection(USERS_COLLECTION).doc(uid);
  const doc = await ref.get();
  if (!doc.exists) return false;

  const data = doc.data();
  if (data?.approved === true) return false; // already approved

  await ref.update({
    approved: true,
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy: "whitelist-auto",
    revokedAt: null,
  });
  return true;
}
