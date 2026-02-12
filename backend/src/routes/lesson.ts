//  src/routes/lesson.ts

import { Router } from "express";
import { 
    startLesson, 
    submitAnswer,
    getSessionHandler } from "../controllers/lessonController";
import { getLessonCatalog } from "../controllers/lessonCatalogController";


const router = Router();


// POST /lesson/start(start a lesson)
router.post("/start", startLesson);

// POST /lesson/submit(submit an answer)
router.post("/submit", submitAnswer);

// GET /lesson/catalog?language=en
router.get("/catalog", getLessonCatalog);

//GET /lesson/session/:userId (legacy resume route)
router.get("/session/:userId", getSessionHandler);

//GET /lesson/:userId?language=en&lessonId=basic-1 (get Session)
router.get("/:userId", getSessionHandler);

export default router;
