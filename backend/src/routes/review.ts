// backend/src/routes/review.ts

import { Router } from "express";
import {
  suggestReview,
  debugReview,
  getReviewSuggested,
  submitReview,
  generateReview,
} from "../controllers/reviewController";

const router = Router();

// Existing suggested review (lesson review items)
router.post("/suggest", suggestReview);

// New review queue endpoints
router.get("/suggested", getReviewSuggested);
router.post("/submit", submitReview);
router.post("/generate", generateReview);

router.get("/debug", debugReview);

export default router;
