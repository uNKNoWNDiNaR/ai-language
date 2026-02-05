//backend/src/routes/practice.ts

import { Router } from "express";
import { generatePractice, generateReview } from "../controllers/practiceController";
import { submitPractice } from "../controllers/practiceSubmitController";
import { suggestReview } from "../controllers/reviewController";

const router = Router();

router.post("/generate", generatePractice);
router.post("/generateReview", generateReview);

router.post("/submit", submitPractice);

// Suggested review (read-only, calm, optional)
router.get("/suggested", suggestReview);

export default router;
