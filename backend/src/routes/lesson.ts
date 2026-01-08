//  src/routes/lesson.ts

import { Router } from "express";
import { startLesson, submitAnswer } from "../controllers/lessonController";

const router = Router();

// POST /lesson/start
router.post("/start", (req, res) => {
    const userId = "user-1"; //for MVP hardcoded user
    const session = startLesson(userId);
    res.json(session);
});

// POST /lesson/submit
router.post("/submit", (req, res) => {
    console.log("Request body:", req.body);  //the console to debug
    const {userId, isCorrect} = req.body;

    if(!userId || typeof isCorrect !== "boolean"){
        return res.status(400).json({error: "userId and isCorrect is required"});
    }

    try {
        const session = submitAnswer(userId, isCorrect);
        res.json(session);
    } catch (err: any){
        res.status(400).json({error: err.message});
    }
})

export default router;