// QazTriber Admin Panel — frontend logic
// Polls /api/users every 4s for real-time sync with Telegram bot actions.

// Detect base path: when served at /admin/, API calls must go to /admin/api/.
// When served at root (direct :3003), API is at /api/.
const BASE = window.location.pathname.startsWith("/admin") ? "/admin" : "";
const API = (path) => `${BASE}/api${path}`;

let currentFilter = "pending";
let users = [];
let stats = null;
let authed = false;
let pollTimer = null;
let currentTab = "users"; // "users" | "whitelist"
let whitelist = [];

// Theme: load from localStorage or default to dark
let theme = localStorage.getItem("qzt-admin-theme") || "dark";
document.documentElement.setAttribute("data-theme", theme);

const app = document.getElementById("app");

function toast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(API(path), {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  if (res.status === 401) { authed = false; render(); throw new Error("auth"); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function fmtDate(ts) {
  if (!ts || !ts.toDate) return "—";
  return new Date(ts.toDate).toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Actions ----------

async function doAction(uid, action) {
  try {
    if (action === "delete" && !confirm("Удалить пользователя безвозвратно?")) return;
    const path = action === "delete" ? `/users/${uid}` : `/users/${uid}/${action}`;
    const method = action === "delete" ? "DELETE" : "POST";
    await api(path, { method });
    toast(`✓ ${actionLabel(action)}`);
    await refresh();
  } catch (e) {
    if (e.message !== "auth") toast(`Ошибка: ${e.message}`, "error");
  }
}

function actionLabel(a) {
  return { approve: "Одобрен", revoke: "Отозван", delete: "Удалён" }[a] || a;
}

// ---------- Render ----------

function renderLogin() {
  app.innerHTML = `
    <div class="login">
      <div class="logo-mark">Q</div>
      <h2>QazTriber Admin</h2>
      <p>Вход только через Telegram-бота.</p>
      <div class="steps">
        <div>1. Откройте бота в Telegram</div>
        <div>2. Отправьте команду <code>/login</code></div>
        <div>3. Перейдите по ссылке из ответа</div>
      </div>
      <p style="font-size:12px">Ссылка одноразовая, действует 1 час.</p>
    </div>`;
}

function renderDashboard() {
  const s = stats || { total: 0, pending: 0, approved: 0, todaySignups: 0, byProvider: {} };
  const googleCount = s.byProvider?.google || 0;
  const emailCount = s.byProvider?.email || 0;
  const googlePct = s.total > 0 ? Math.round((googleCount / s.total) * 100) : 0;
  const emailPct = s.total > 0 ? Math.round((emailCount / s.total) * 100) : 0;
  const approvalRate = s.total > 0 ? Math.round((s.approved / s.total) * 100) : 0;

  app.innerHTML = `
    <div class="header">
      <div class="header-left">
        <div class="logo-mark">Q</div>
        <div>
          <h1>QazTriber Admin</h1>
          <div class="tagline">Управление доступом пользователей</div>
        </div>
      </div>
      <div class="header-right">
        <span class="live-dot"></span>
        <span class="live-label">Live · обновление 4с</span>
        <button class="theme-toggle" id="themeBtn" title="Сменить тему">${theme === "dark" ? "☀️" : "🌙"}</button>
        <button class="logout-btn" id="logoutBtn">Выйти</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="label">Всего</div><div class="value">${s.total}</div><div class="sub">пользователей</div></div>
      <div class="stat-card"><div class="label">Ожидают</div><div class="value warn">${s.pending}</div><div class="sub">требуют внимания</div></div>
      <div class="stat-card"><div class="label">Одобрены</div><div class="value done">${s.approved}</div><div class="sub">${approvalRate}% от всех</div></div>
      <div class="stat-card"><div class="label">За сегодня</div><div class="value gold">${s.todaySignups}</div><div class="sub">новых регистраций</div></div>
    </div>

    <div class="provider-stats">
      <h3>По способу входа</h3>
      <div class="provider-bar">
        <span class="name">Google</span>
        <div class="bar-bg"><div class="bar-fill google" style="width: ${googlePct}%"></div></div>
        <span class="count">${googleCount}</span>
      </div>
      <div class="provider-bar">
        <span class="name">Email</span>
        <div class="bar-bg"><div class="bar-fill email" style="width: ${emailPct}%"></div></div>
        <span class="count">${emailCount}</span>
      </div>
    </div>

    <div class="tabs">
      <button class="tab ${currentTab === "users" ? "active" : ""}" data-tab="users">Пользователи</button>
      <button class="tab ${currentTab === "whitelist" ? "active" : ""}" data-tab="whitelist">Белый список ${whitelist.length ? `(${whitelist.length})` : ""}</button>
    </div>

    <div id="tab-content">${currentTab === "users" ? renderUsersTab() : renderWhitelistTab()}</div>
  `;

  document.getElementById("themeBtn").onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("qzt-admin-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    render();
  };
  document.getElementById("logoutBtn").onclick = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    authed = false; stopPolling(); render();
  };
  document.querySelectorAll(".tab").forEach((t) => {
    t.onclick = () => { currentTab = t.dataset.tab; render(); };
  });

  // Bind tab-specific handlers
  if (currentTab === "users") bindUsersTab();
  else bindWhitelistTab();
}

// ---------- Users Tab ----------

function renderUsersTab() {
  return `
    <div class="filters">
      <button class="filter-btn ${currentFilter === "pending" ? "active" : ""}" data-f="pending">Ожидающие</button>
      <button class="filter-btn ${currentFilter === "approved" ? "active" : ""}" data-f="approved">Одобренные</button>
      <button class="filter-btn ${currentFilter === "all" ? "active" : ""}" data-f="all">Все</button>
    </div>
    <div class="table-wrap">${renderTable()}</div>
  `;
}

function bindUsersTab() {
  document.querySelectorAll(".filter-btn").forEach((b) => {
    b.onclick = () => { currentFilter = b.dataset.f; refresh(); };
  });
  document.querySelectorAll("[data-action]").forEach((b) => {
    b.onclick = () => doAction(b.dataset.uid, b.dataset.action);
  });
}

// ---------- Whitelist Tab ----------

function renderWhitelistTab() {
  return `
    <div class="wl-section">
      <h3 style="font-size:14px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); margin-bottom:16px;">Добавить вручную</h3>
      <div class="wl-add-row">
        <input class="wl-input" id="wlEmailInput" type="email" placeholder="user@example.com" />
        <button class="btn btn-approve" id="wlAddBtn" style="padding:10px 20px;">Добавить</button>
      </div>
    </div>

    <div class="wl-section">
      <h3 style="font-size:14px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); margin-bottom:16px;">Импорт из Excel/CSV</h3>
      <div class="wl-import-area" id="wlDropZone">
        <div class="icon">📄</div>
        <div class="text">Перетащите файл сюда или нажмите для выбора</div>
        <div class="hint">Поддерживается .xlsx, .csv. Первый столбец должен содержать email-адреса.</div>
      </div>
      <input type="file" id="wlFileInput" accept=".xlsx,.csv" style="display:none" />
    </div>

    <div class="wl-section">
      <h3 style="font-size:14px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); margin-bottom:16px;">
        Белый список (${whitelist.length})
      </h3>
      <div class="wl-list" id="wlList">
        ${whitelist.length === 0
          ? '<div class="wl-empty">Список пуст. Добавьте email-ы вручную или импортируйте из файла.</div>'
          : whitelist.map((w) => `
            <div class="wl-entry">
              <div>
                <span class="email">${escapeHtml(w.email)}</span>
                <span class="source-badge ${w.source}">${w.source === "excel" ? "Excel" : "Вручную"}</span>
                <div class="meta">Добавлен: ${fmtDate(w.addedAt)}</div>
              </div>
              <button class="btn btn-delete" data-wl-email="${escapeHtml(w.email)}" style="padding:4px 10px;">Удалить</button>
            </div>
          `).join("")
        }
      </div>
    </div>
  `;
}

function bindWhitelistTab() {
  // Add manually
  const emailInput = document.getElementById("wlEmailInput");
  const addBtn = document.getElementById("wlAddBtn");
  if (addBtn) {
    addBtn.onclick = async () => {
      const email = emailInput.value.trim();
      if (!email) return;
      try {
        await api("/whitelist", { method: "POST", body: JSON.stringify({ email }) });
        toast(`✓ ${email} добавлен в белый список`);
        emailInput.value = "";
        await refreshWhitelist();
      } catch (e) { toast(`Ошибка: ${e.message}`, "error"); }
    };
    emailInput.onkeydown = (e) => { if (e.key === "Enter") addBtn.click(); };
  }

  // File import (drag & drop + click)
  const dropZone = document.getElementById("wlDropZone");
  const fileInput = document.getElementById("wlFileInput");
  if (dropZone && fileInput) {
    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add("dragover"); };
    dropZone.ondragleave = () => dropZone.classList.remove("dragover");
    dropZone.ondrop = async (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) await handleFileImport(file);
    };
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) await handleFileImport(file);
      fileInput.value = "";
    };
  }

  // Delete whitelist entry
  document.querySelectorAll("[data-wl-email]").forEach((b) => {
    b.onclick = async () => {
      const email = b.dataset.wlEmail;
      try {
        await api(`/whitelist/${encodeURIComponent(email)}`, { method: "DELETE" });
        toast(`✓ ${email} удалён из белого списка`);
        await refreshWhitelist();
      } catch (e) { toast(`Ошибка: ${e.message}`, "error"); }
    };
  });
}

async function handleFileImport(file) {
  try {
    const emails = await extractEmailsFromFile(file);
    if (emails.length === 0) {
      toast("В файле не найдены email-адреса", "error");
      return;
    }
    toast(`Импорт ${emails.length} email-ов...`);
    const result = await api("/whitelist/import", {
      method: "POST",
      body: JSON.stringify({ emails }),
    });
    toast(`✓ Добавлено: ${result.added}, пропущено: ${result.skipped}, невалидных: ${result.invalid}`);
    await refreshWhitelist();
  } catch (e) {
    toast(`Ошибка импорта: ${e.message}`, "error");
  }
}

async function extractEmailsFromFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || file.type === "text/csv") {
    // CSV: read as text, extract emails from all cells
    const text = await file.text();
    return extractEmailsFromText(text);
  }

  if (name.endsWith(".xlsx")) {
    // XLSX: load SheetJS dynamically, parse first sheet
    await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(ws);
    return extractEmailsFromText(csv);
  }

  // Fallback: try as text
  const text = await file.text();
  return extractEmailsFromText(text);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function extractEmailsFromText(text) {
  // Match email pattern: word chars + @ + domain
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  // Deduplicate
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

async function refreshWhitelist() {
  try {
    const data = await api("/whitelist");
    whitelist = data.entries;
    render();
  } catch (e) { /* ignore */ }
}

function renderTable() {
  if (!users.length) {
    return `<div class="empty"><div class="icon">📭</div><div>Нет пользователей</div></div>`;
  }
  return `
    <table>
      <thead>
        <tr><th>Email</th><th>Провайдер</th><th>Регистрация</th><th>Статус</th><th>Действия</th></tr>
      </thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td class="email-cell">${escapeHtml(u.email || "—")}<div class="uid-cell">${escapeHtml(u.uid)}</div></td>
            <td><span class="provider-badge ${escapeHtml(u.provider)}">${u.provider === "google" ? "Google" : "Email"}</span></td>
            <td>${fmtDate(u.createdAt)}</td>
            <td><span class="status-badge ${escapeHtml(u.status)}"><span class="dot"></span>${u.status === "approved" ? "Одобрен" : "Ожидает"}</span></td>
            <td class="actions">${renderActions(u)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

function renderActions(u) {
  const uid = escapeHtml(u.uid);
  if (u.approved) {
    return `<button class="btn btn-revoke" data-uid="${uid}" data-action="revoke">Отозвать</button>
            <button class="btn btn-delete" data-uid="${uid}" data-action="delete">Удалить</button>`;
  }
  return `<button class="btn btn-approve" data-uid="${uid}" data-action="approve">Одобрить</button>
          <button class="btn btn-delete" data-uid="${uid}" data-action="delete">Отклонить</button>`;
}

function render() {
  if (!authed) { renderLogin(); return; }
  renderDashboard();
}

// ---------- Polling ----------

async function refresh() {
  if (!authed) return;
  try {
    const [usersRes, statsRes, wlRes] = await Promise.all([
      api(`/users?filter=${currentFilter}`),
      api("/stats"),
      api("/whitelist"),
    ]);
    users = usersRes.users;
    stats = statsRes.stats;
    whitelist = wlRes.entries;
    render();
  } catch (e) {
    if (e.message === "auth") { authed = false; stopPolling(); render(); }
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(refresh, 4000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ---------- Init ----------

(async function init() {
  try {
    const me = await api("/auth/me");
    authed = me.authenticated;
  } catch { authed = false; }
  if (authed) { await refresh(); startPolling(); }
  render();
})();
