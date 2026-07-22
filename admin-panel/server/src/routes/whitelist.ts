/**
 * Whitelist routes — manage pre-approved emails.
 * All routes require admin auth.
 *
 * Endpoints:
 *   GET    /api/whitelist           — list all
 *   POST   /api/whitelist           — add single email { email }
 *   DELETE /api/whitelist/:email    — remove email
 *   POST   /api/whitelist/import    — bulk import { emails: string[] }
 */

import { Router } from "express";
import { listWhitelist, addWhitelistEntry, removeWhitelistEntry, importWhitelist } from "../whitelistService.js";

export const whitelistRouter = Router();

// GET /api/whitelist
whitelistRouter.get("/", async (_req, res) => {
  try {
    const entries = await listWhitelist();
    res.json({ entries });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/whitelist  { email: "user@example.com" }
whitelistRouter.post("/", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: "Email не указан" });
      return;
    }
    const result = await addWhitelistEntry(email, "web");
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /api/whitelist/:email
whitelistRouter.delete("/:email", async (req, res) => {
  try {
    await removeWhitelistEntry(req.params.email);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/whitelist/import  { emails: ["a@b.com", "c@d.com", ...] }
whitelistRouter.post("/import", async (req, res) => {
  try {
    const { emails } = req.body as { emails?: string[] };
    if (!Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: "Передайте массив emails" });
      return;
    }
    const result = await importWhitelist(emails, "web");
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
