//  src/routes/lesson.ts

import { Router } from "express";
import { 
    startLesson, 
    submitAnswer,
    getSessionHandler } from "../controllers/lessonController";


const router = Router();


// POST /lesson/start(start a lesson)
router.post("/start", startLesson);

// POST /lesson/submit(submit an answer)
router.post("/submit", submitAnswer);

//GET /lesson/:userId (get Session)
router.get("/:userId", getSessionHandler);

export default router;