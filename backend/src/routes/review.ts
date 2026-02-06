// backend/src/routes/review.ts

import { Router } from "express";
import { suggestReview, debugReview } from "../controllers/reviewController";

const router = Router();

// Calm, optional review suggestions (no gamification)
router.post("/suggest", suggestReview);
router.get("/suggested", suggestReview);
router.get("/debug", debugReview);

export default router;
