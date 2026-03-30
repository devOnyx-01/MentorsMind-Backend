import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { idempotency } from "../middleware/idempotency.middleware";

/** Escrow HTTP routes */
const router = Router();

// POST /escrow — idempotency guard applied; handler to be implemented
router.post("/", authenticate, idempotency, (_req, res) => {
  res.status(501).json({ success: false, error: "Not implemented" });
});

export default router;
