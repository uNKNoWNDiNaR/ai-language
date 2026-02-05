// backend/src/routes/review.ts

import { Router } from "express";
import { suggestReview } from "../controllers/reviewController";

const router = Router();

// Calm, optional review suggestions (no gamification)
router.post("/suggest", suggestReview);
router.get("/suggested", suggestReview);

export default router;
