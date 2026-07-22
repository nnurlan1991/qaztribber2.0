/**
 * QazTriber Admin Panel — Express server entry point.
 *
 * Wires together:
 *   - Firebase Admin SDK (initFirebase)
 *   - Telegram bot with onSnapshot sync (startBot)
 *   - REST API routes (users, stats, auth)
 *   - Static admin frontend (web/)
 *
 * Run on VPS: pm2 start dist/index.js --name qaztriber-admin
 * Behind nginx: location /admin/ { proxy_pass http://127.0.0.1:3003/; }
 */

import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { initFirebase } from "./firebase.js";
import { verifyCookie, COOKIE_NAME } from "./auth.js";
import { startBot } from "./telegram-bot.js";
import { usersRouter } from "./routes/users.js";
import { statsRouter } from "./routes/stats.js";
import { authRouter } from "./routes/auth.js";
import { googleAuthRouter } from "./routes/google-auth.js";
import { whitelistRouter } from "./routes/whitelist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Bootstrap ---
initFirebase();
startBot();

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(cookieParser());

// Security headers — defense in depth (prevents clickjacking, MIME sniffing,
// and provides a CSP backstop against any XSS that slips through escapeHtml).
// NOTE: google.html needs a relaxed CSP to load Firebase SDK from gstatic.com
// and connect to Google/Firebase APIs.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");

  // Relaxed CSP for Google Sign-In page (needs Firebase SDK + Google APIs)
  if (req.path.includes("google.html")) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com https://apis.google.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://accounts.google.com; frame-src https://*.firebaseapp.com https://accounts.google.com; img-src 'self' data: https:"
    );
  } else {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'"
    );
  }
  next();
});

// Trust proxy headers (nginx sets X-Forwarded-*) so req.secure + protocol work.
app.set("trust proxy", 1);

// --- Global error handlers — prevent unhandled rejections from killing the server ---
// (Telegram bot listeners and Firestore onSnapshot can throw asynchronously.)
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException:", err);
});

// --- Admin auth middleware: attach req.adminSession from cookie ---
app.use((req: Request, _res: Response, next: NextFunction) => {
  const cookie = req.cookies?.[COOKIE_NAME];
  req.adminSession = verifyCookie(cookie) ?? undefined;
  next();
});

// --- Public routes (auth verify, login flow, Google desktop auth) ---
// Google auth endpoints need CORS — desktop app (localhost:5173 or tauri://)
// fetches them cross-origin. Other auth routes are same-origin (via nginx).
app.use(["/api/auth/google", "/admin/api/auth/google"], (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
}, googleAuthRouter);
app.use(["/api/auth", "/admin/api/auth"], authRouter);

// --- Protected API: require valid admin session ---
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.adminSession) {
    res.status(401).json({ error: "Не авторизован. Войдите через Telegram-бота: /login" });
    return;
  }
  next();
}
app.use(["/api/users", "/admin/api/users"], requireAdmin, usersRouter);
app.use(["/api/stats", "/admin/api/stats"], requireAdmin, statsRouter);
app.use(["/api/whitelist", "/admin/api/whitelist"], requireAdmin, whitelistRouter);

// --- Static frontend (admin panel UI) ---
// web/ is sibling of server/. When running from dist/, __dirname = server/dist,
// so web/ is at ../../web. Check multiple candidate paths for robustness
// (dev mode runs from src/ where web is at ../web).
const webCandidates = [
  path.resolve(__dirname, "..", "web"),        // dev: server/src → server/web (no, web is sibling of server)
  path.resolve(__dirname, "..", "..", "web"),   // prod: server/dist → admin-panel/web
  path.resolve(__dirname, "..", "..", "..", "web"), // alt
];
const webDir = webCandidates.find((p) => existsSync(path.join(p, "index.html")));
if (!webDir) {
  console.error("[server] FATAL: web/ directory with index.html not found in:", webCandidates);
} else {
  app.use("/admin", express.static(webDir));
  app.get(["/admin", "/admin/"], (_req: Request, res: Response) => {
    res.sendFile(path.join(webDir, "index.html"));
  });
  // Explicit route for google.html (express.static sometimes misses it)
  app.get(["/admin/google.html", "/google.html"], (_req: Request, res: Response) => {
    res.sendFile(path.join(webDir, "google.html"));
  });
  console.log("[server] serving admin UI from:", webDir);
}

// --- Health check (for pm2/nginx) — works at both /health and /admin/health ---
app.get(["/health", "/admin/health"], (_req: Request, res: Response) => res.json({ ok: true, ts: Date.now() }));

// --- 404 for unknown API ---
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(config.port, () => {
  console.log(`[server] QazTriber admin listening on :${config.port} (${config.nodeEnv})`);
  console.log(`[server] admin panel: ${config.publicUrl}`);
});

// Type augmentation for req.adminSession
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminSession?: { chatId: string; issuedAt: number };
    }
  }
}
