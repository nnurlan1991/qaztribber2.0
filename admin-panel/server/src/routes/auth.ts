import { Router } from "express";
import { verifyToken, issueSessionCookie, COOKIE_NAME, TTL_SECONDS } from "../auth.js";

export const authRouter = Router();

// GET /api/auth/verify?token=<jwt>
// Consumes the one-time magic-link token, sets a session cookie, redirects to /.
authRouter.get("/verify", (req, res) => {
  const token = (req.query.token as string) ?? "";
  if (!token) {
    res.status(400).send("Missing token");
    return;
  }
  try {
    verifyToken(token); // throws on invalid/used/mismatch
    res.cookie(COOKIE_NAME, issueSessionCookie(), {
      httpOnly: true,
      secure: req.secure || req.headers["x-forwarded-proto"] === "https",
      sameSite: "lax",
      maxAge: TTL_SECONDS * 1000,
      path: "/",
    });
    res.redirect("/admin/");
  } catch (e) {
    res.status(401).send(`Auth failed: ${(e as Error).message}`);
  }
});

// GET /api/auth/me — check current session
authRouter.get("/me", (req, res) => {
  if (req.adminSession) {
    res.json({ authenticated: true, session: req.adminSession });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

// POST /api/auth/logout
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});
