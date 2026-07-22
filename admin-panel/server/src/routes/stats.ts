import { Router } from "express";
import { getStats } from "../userService.js";

export const statsRouter = Router();

// GET /api/stats
statsRouter.get("/", async (_req, res) => {
  try {
    const stats = await getStats();
    res.json({ stats });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
