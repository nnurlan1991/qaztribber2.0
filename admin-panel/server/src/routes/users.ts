/**
 * Express routes: user management.
 * All routes require admin auth (requireAdmin middleware).
 */

import { Router } from "express";
import { listUsers, getUser, approveUser, revokeUser, deleteUser } from "../userService.js";

export const usersRouter = Router();

// GET /api/users?filter=all|pending|approved
usersRouter.get("/", async (req, res) => {
  try {
    const filter = (req.query.filter as string) ?? "all";
    const valid = ["all", "pending", "approved"];
    if (!valid.includes(filter)) {
      res.status(400).json({ error: "filter must be all|pending|approved" });
      return;
    }
    const users = await listUsers(filter as "all" | "pending" | "approved");
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/users/:uid
usersRouter.get("/:uid", async (req, res) => {
  try {
    const u = await getUser(req.params.uid);
    if (!u) {
      res.status(404).json({ error: "Не найден" });
      return;
    }
    res.json({ user: u });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/users/:uid/approve
usersRouter.post("/:uid/approve", async (req, res) => {
  try {
    const u = await approveUser(req.params.uid, "web");
    res.json({ user: u });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

// POST /api/users/:uid/revoke
usersRouter.post("/:uid/revoke", async (req, res) => {
  try {
    const u = await revokeUser(req.params.uid);
    res.json({ user: u });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

// DELETE /api/users/:uid
usersRouter.delete("/:uid", async (req, res) => {
  try {
    await deleteUser(req.params.uid);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
