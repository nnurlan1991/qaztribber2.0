/**
 * User service — shared Firestore/Auth operations used by both the
 * web admin routes and the Telegram bot callback handlers.
 *
 * Single implementation → consistent behavior across channels.
 * Race-condition safe: each op re-reads the doc before writing.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getDb, getAdminAuth, USERS_COLLECTION } from "./firebase.js";

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  provider: string;
  approved: boolean;
  createdAt?: { toDate?: () => Date } | null;
  approvedAt?: { toDate?: () => Date } | null;
  approvedBy?: string | null;
  pendingMessageId?: number | null;
  revokedAt?: { toDate?: () => Date } | null;
}

export interface UserListItem extends UserDoc {
  status: "pending" | "approved";
}

function toListItem(u: UserDoc): UserListItem {
  return { ...u, status: u.approved ? "approved" : "pending" };
}

export async function listUsers(filter: "all" | "pending" | "approved" = "all"): Promise<UserListItem[]> {
  let q = getDb().collection(USERS_COLLECTION).orderBy("createdAt", "desc");
  if (filter === "pending") q = q.where("approved", "==", false);
  else if (filter === "approved") q = q.where("approved", "==", true);
  const snap = await q.get();
  const out: UserListItem[] = [];
  snap.forEach((d) => out.push(toListItem(d.data() as UserDoc)));
  return out;
}

export async function getUser(uid: string): Promise<UserListItem | null> {
  const doc = await getDb().collection(USERS_COLLECTION).doc(uid).get();
  if (!doc.exists) return null;
  return toListItem(doc.data() as UserDoc);
}

/**
 * Approve a pending user. Idempotent: if already approved, returns current
 * state without re-writing (avoids clobbering approvedBy/approvedAt).
 */
export async function approveUser(uid: string, approvedBy: string): Promise<UserListItem> {
  const ref = getDb().collection(USERS_COLLECTION).doc(uid);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Пользователь не найден");
  const u = doc.data() as UserDoc;
  if (u.approved) return toListItem(u);
  await ref.update({
    approved: true,
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy,
    revokedAt: null,
  });
  const updated = await ref.get();
  return toListItem(updated.data() as UserDoc);
}

/**
 * Revoke access from an approved user (set approved=false). Idempotent.
 */
export async function revokeUser(uid: string): Promise<UserListItem> {
  const ref = getDb().collection(USERS_COLLECTION).doc(uid);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Пользователь не найден");
  const u = doc.data() as UserDoc;
  if (!u.approved) return toListItem(u);
  await ref.update({
    approved: false,
    revokedAt: FieldValue.serverTimestamp(),
    approvedAt: null,
    approvedBy: null,
  });
  const updated = await ref.get();
  return toListItem(updated.data() as UserDoc);
}

/**
 * Permanently delete a user: Firestore doc + Firebase Auth record.
 * Cleans up both stores. If Auth record is already gone, Firestore delete
 * still succeeds (best-effort).
 */
export async function deleteUser(uid: string): Promise<void> {
  const ref = getDb().collection(USERS_COLLECTION).doc(uid);
  await ref.delete();
  try {
    await getAdminAuth().deleteUser(uid);
  } catch (e) {
    console.warn(`[userService] auth.deleteUser(${uid}) failed:`, (e as Error).message);
  }
}

export interface Stats {
  total: number;
  pending: number;
  approved: number;
  byProvider: Record<string, number>;
  todaySignups: number;
}

export async function getStats(): Promise<Stats> {
  const snap = await getDb().collection(USERS_COLLECTION).get();
  const stats: Stats = {
    total: 0,
    pending: 0,
    approved: 0,
    byProvider: {},
    todaySignups: 0,
  };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  snap.forEach((d) => {
    const u = d.data() as UserDoc;
    stats.total++;
    if (u.approved) stats.approved++;
    else stats.pending++;
    stats.byProvider[u.provider] = (stats.byProvider[u.provider] ?? 0) + 1;
    if (u.createdAt?.toDate) {
      const created = u.createdAt.toDate();
      if (created >= startOfToday) stats.todaySignups++;
    }
  });
  return stats;
}
