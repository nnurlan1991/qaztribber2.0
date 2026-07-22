/**
 * Telegram Bot — synchronized with the web admin panel via Firestore.
 *
 * SYNC ARCHITECTURE (the critical part):
 *
 *   Firestore users/{uid}  ←  single source of truth
 *        ▲   ▲
 *        │   │
 *   Web admin   Telegram bot   (both write via Admin SDK)
 *        │   │
 *        ▼   ▼
 *   onSnapshot listeners detect ALL changes → bot edits its messages
 *
 * Listeners:
 *   A) pending users (approved==false): new → send message w/ buttons,
 *      re-pending (revoked) → edit message back to pending state
 *   B) approved users (approved==true): if had pendingMessageId → edit to "✅"
 *
 * Race-condition protection: every callback handler re-reads the doc
 * before writing. If already approved, responds idempotently.
 */

import TelegramBot from "node-telegram-bot-api";
import { config } from "./config.js";
import { getDb, USERS_COLLECTION } from "./firebase.js";
import { issueMagicLink } from "./auth.js";
import { approveUser, revokeUser, deleteUser, getUser, type UserDoc } from "./userService.js";
import { autoApproveIfWhitelisted } from "./whitelistService.js";

let bot: TelegramBot;
let started = false;

function fmtDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== "function") return "—";
  return ts.toDate().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });
}

function escapeHtmlTelegram(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeEmail(email: string): string {
  // Mask partially for privacy in Telegram chat logs.
  // Escape HTML first (messages use parse_mode=HTML) to prevent injection
  // via crafted email field — defense in depth even though firestore.rules
  // now validates email == auth.token.email.
  const escaped = escapeHtmlTelegram(email);
  if (!escaped || !escaped.includes("@")) return escaped || "(нет email)";
  const [name, domain] = escaped.split("@");
  if (name.length <= 2) return `${name[0] ?? ""}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

function pendingKeyboard(uid: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Одобрить", callback_data: `app:${uid}` },
        { text: "❌ Отклонить", callback_data: `rej:${uid}` },
      ],
    ],
  };
}

function pendingText(u: UserDoc): string {
  return [
    "🔔 Новый пользователь ожидает подтверждения",
    "",
    `📧 ${safeEmail(u.email)}`,
    `🆔 <code>${escapeHtmlTelegram(u.uid)}</code>`,
    `Провайдер: ${u.provider === "google" ? "Google" : "Email"}`,
    `Регистрация: ${fmtDate(u.createdAt)}`,
  ].join("\n");
}

export function startBot(): void {
  if (started) return;
  started = true;

  bot = new TelegramBot(config.telegram.botToken, { polling: true });
  const adminChatId = config.telegram.adminChatId;

  // ---------- Commands ----------

  bot.setMyCommands([
    { command: "start", description: "Приветствие" },
    { command: "login", description: "Ссылка на админ-панель" },
    { command: "stats", description: "Краткая статистика" },
    { command: "pending", description: "Список ожидающих" },
  ]).catch((e) => console.warn("[telegram] setMyCommands failed:", (e as Error).message));

  bot.onText(/^\/start/, (msg) => {
    if (msg.chat.id.toString() !== adminChatId) return;
    bot.sendMessage(
      msg.chat.id,
      "QazTriber Admin\n\n" +
        "/login — открыть админ-панель\n" +
        "/stats — статистика\n" +
        "/pending — ожидающие подтверждения",
      { disable_web_page_preview: true }
    ).catch(() => {});
  });

  bot.onText(/^\/login/, (msg) => {
    if (msg.chat.id.toString() !== adminChatId) return;
    const link = issueMagicLink();
    bot.sendMessage(
      msg.chat.id,
      "🔓 Ссылка для входа в админ-панель (действительна 1 час, одноразовая):\n\n" + link,
      { disable_web_page_preview: true }
    ).catch(() => {});
  });

  bot.onText(/^\/stats/, async (msg) => {
    if (msg.chat.id.toString() !== adminChatId) return;
    try {
      const snap = await getDb().collection(USERS_COLLECTION).get();
      let total = 0, pending = 0, approved = 0;
      snap.forEach((d) => {
        const u = d.data() as UserDoc;
        total++;
        if (u.approved) approved++;
        else pending++;
      });
      await bot.sendMessage(msg.chat.id, `📊 Статистика\n\nВсего: ${total}\nОжидают: ${pending}\nОдобрены: ${approved}`);
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Ошибка: ${(e as Error).message}`).catch(() => {});
    }
  });

  bot.onText(/^\/pending/, async (msg) => {
    if (msg.chat.id.toString() !== adminChatId) return;
    try {
      const snap = await getDb()
        .collection(USERS_COLLECTION)
        .where("approved", "==", false)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();
      if (snap.empty) {
        await bot.sendMessage(msg.chat.id, "Нет ожидающих пользователей 🎉");
        return;
      }
      const lines: string[] = ["⏳ Ожидающие:", ""];
      snap.forEach((d) => {
        const u = d.data() as UserDoc;
        lines.push(`📧 ${safeEmail(u.email)} — ${fmtDate(u.createdAt)}`);
      });
      await bot.sendMessage(msg.chat.id, lines.join("\n"));
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Ошибка: ${(e as Error).message}`).catch(() => {});
    }
  });

  // ---------- Inline callback handlers ----------

  bot.on("callback_query", async (q) => {
    if (q.from.id.toString() !== adminChatId) {
      bot.answerCallbackQuery(q.id, { text: "Не авторизован" }).catch(() => {});
      return;
    }
    const data = q.data ?? "";
    const [action, uid] = data.split(":");
    if (!action || !uid) {
      bot.answerCallbackQuery(q.id, { text: "Некорректный запрос" }).catch(() => {});
      return;
    }

    try {
      if (action === "app") await handleApproveViaBot(uid, q);
      else if (action === "rej") await handleRejectViaBot(uid, q);
      else if (action === "rev") await handleRevokeViaBot(uid, q);
      else bot.answerCallbackQuery(q.id, { text: "Неизвестное действие" }).catch(() => {});
    } catch (e) {
      bot.answerCallbackQuery(q.id, { text: `Ошибка: ${(e as Error).message}` }).catch(() => {});
    }
  });

  // ---------- Polling sync (replaces onSnapshot — gRPC unstable under pm2) ----------
  // Every 5s: query Firestore for pending + approved users, detect changes,
  // send/edit Telegram messages. This is the cross-channel sync mechanism:
  //   - Web admin approves → polling detects → bot edits message to ✅
  //   - Bot approves via inline button → web admin sees on next 4s poll
  setupPollingSync();

  console.log(`[telegram] bot started, admin chat_id=${adminChatId}`);
}

// ---------- Polling sync (replaces onSnapshot) ----------
// In-memory state: track which users we've already sent/edited messages for.
// Cleared on restart (acceptable — bot re-sends messages for pending users
// that have no pendingMessageId, and re-edits those that do).
const seenPending = new Set<string>();   // uids we've already handled as pending
const seenApproved = new Set<string>();  // uids we've already handled as approved

const POLL_INTERVAL_MS = 5000;

function setupPollingSync(): void {
  setInterval(async () => {
    try {
      await pollPending();
      await pollApproved();
    } catch (e) {
      console.error("[telegram] poll error:", (e as Error).message);
    }
  }, POLL_INTERVAL_MS);
}

async function pollPending(): Promise<void> {
  const snap = await getDb()
    .collection(USERS_COLLECTION)
    .where("approved", "==", false)
    .get();

  for (const doc of snap.docs) {
    const u = doc.data() as UserDoc;

    // Auto-approve: check if email is in whitelist
    if (u.email) {
      const autoApproved = await autoApproveIfWhitelisted(u.uid, u.email).catch(() => false);
      if (autoApproved) {
        console.log(`[telegram] auto-approved whitelisted user: ${u.email}`);
        seenPending.delete(u.uid);
        continue; // skip sending pending message — user is now approved
      }
    }

    if (u.pendingMessageId) {
      if (!seenPending.has(u.uid) || seenApproved.has(u.uid)) {
        seenApproved.delete(u.uid);
        seenPending.add(u.uid);
        await editToPending(u).catch(() => {});
      }
    } else {
      if (!seenPending.has(u.uid)) {
        seenPending.add(u.uid);
        await sendPendingMessage(u).catch(() => {});
      }
    }
  }
}

async function pollApproved(): Promise<void> {
  const snap = await getDb()
    .collection(USERS_COLLECTION)
    .where("approved", "==", true)
    .get();

  for (const doc of snap.docs) {
    const u = doc.data() as UserDoc;
    // If user was previously seen as pending and now approved → edit to ✅.
    if (u.pendingMessageId && seenPending.has(u.uid) && !seenApproved.has(u.uid)) {
      seenApproved.add(u.uid);
      seenPending.delete(u.uid);
      await editToApproved(u).catch(() => {});
    }
    // Mark as seen-approved so we don't re-process.
    seenApproved.add(u.uid);
  }
}

async function sendPendingMessage(u: UserDoc): Promise<void> {
  const sent = await bot.sendMessage(config.telegram.adminChatId, pendingText(u), {
    parse_mode: "HTML",
    reply_markup: pendingKeyboard(u.uid),
  });
  // Store message id so web-approve can later edit THIS message.
  await getDb()
    .collection(USERS_COLLECTION)
    .doc(u.uid)
    .set({ pendingMessageId: sent.message_id }, { merge: true });
}

async function editToPending(u: UserDoc): Promise<void> {
  if (!u.pendingMessageId) return;
  try {
    await bot.editMessageText(pendingText(u), {
      chat_id: config.telegram.adminChatId,
      message_id: u.pendingMessageId,
      parse_mode: "HTML",
      reply_markup: pendingKeyboard(u.uid),
    });
  } catch {
    // "message is not modified" or deleted — ignore.
  }
}

async function editToApproved(u: UserDoc): Promise<void> {
  if (!u.pendingMessageId) return;
  try {
    await bot.editMessageText(
      [
        "✅ Одобрен" + (u.approvedBy ? ` (${escapeHtmlTelegram(u.approvedBy)})` : ""),
        "",
        `📧 ${safeEmail(u.email)}`,
        `🆔 <code>${escapeHtmlTelegram(u.uid)}</code>`,
        `Когда: ${fmtDate(u.approvedAt)}`,
      ].join("\n"),
      {
        chat_id: config.telegram.adminChatId,
        message_id: u.pendingMessageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "↩️ Отозвать", callback_data: `rev:${u.uid}` }]],
        },
      }
    );
  } catch {
    // ignore edit errors
  }
}

async function editToRejected(u: UserDoc): Promise<void> {
  if (!u.pendingMessageId) return;
  try {
    await bot.editMessageText(
      [
        "❌ Отклонён / удалён",
        "",
        `📧 ${safeEmail(u.email)}`,
        `🆔 <code>${escapeHtmlTelegram(u.uid)}</code>`,
      ].join("\n"),
      {
        chat_id: config.telegram.adminChatId,
        message_id: u.pendingMessageId,
        parse_mode: "HTML",
      }
    );
  } catch {
    // ignore
  }
}

// ---------- Bot-initiated actions (callback handlers) ----------

async function handleApproveViaBot(uid: string, q: TelegramBot.CallbackQuery): Promise<void> {
  try {
    await approveUser(uid, "telegram");
    bot.answerCallbackQuery(q.id, { text: "✅ Одобрен" }).catch(() => {});
    // onSnapshot will edit the message; no need to do it here.
  } catch (e) {
    bot.answerCallbackQuery(q.id, { text: (e as Error).message }).catch(() => {});
  }
}

async function handleRevokeViaBot(uid: string, q: TelegramBot.CallbackQuery): Promise<void> {
  try {
    await revokeUser(uid);
    bot.answerCallbackQuery(q.id, { text: "↩️ Доступ отозван" }).catch(() => {});
    // onSnapshot pending listener will re-render the message with buttons.
  } catch (e) {
    bot.answerCallbackQuery(q.id, { text: (e as Error).message }).catch(() => {});
  }
}

async function handleRejectViaBot(uid: string, q: TelegramBot.CallbackQuery): Promise<void> {
  const u = await getUser(uid);
  if (u) await editToRejected(u);
  try {
    await deleteUser(uid);
    bot.answerCallbackQuery(q.id, { text: "❌ Удалён" }).catch(() => {});
  } catch (e) {
    bot.answerCallbackQuery(q.id, { text: (e as Error).message }).catch(() => {});
  }
}
