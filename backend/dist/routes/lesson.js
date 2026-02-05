"use strict";
//  src/routes/lesson.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const lessonController_1 = require("../controllers/lessonController");
const router = (0, express_1.Router)();
// POST /lesson/start(start a lesson)
router.post("/start", lessonController_1.startLesson);
// POST /lesson/submit(submit an answer)
router.post("/submit", lessonController_1.submitAnswer);
//GET /lesson/session/:userId (legacy resume route)
router.get("/session/:userId", lessonController_1.getSessionHandler);
//GET /lesson/:userId (get Session)
router.get("/:userId", lessonController_1.getSessionHandler);
exports.default = router;
