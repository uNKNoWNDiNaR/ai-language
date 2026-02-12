//backend/src/routes/feedback.ts

import { Router } from "express";
import { submitFeedback, submitLessonFeedback } from "../controllers/feedbackController";

const router = Router();

router.post("/", submitFeedback);
router.post("/lesson", submitLessonFeedback);

export default router;
