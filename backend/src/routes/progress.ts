// backend/src/routes/progress.ts

import { Router } from "express";
import { getLessonProgress, getUserProgress } from "../controllers/progressController";

const router = Router();

router.get("/:userId", getUserProgress);
router.get("/:userId/:lessonId", getLessonProgress);

export default router;
