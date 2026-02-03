//backend/src/routes/feedback.ts

import { Router } from "express";
import { submitFeedback } from "../controllers/feedbackController";

const router = Router();

router.post("/", submitFeedback);

export default router;
