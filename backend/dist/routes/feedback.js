"use strict";
//backend/src/routes/feedback.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const feedbackController_1 = require("../controllers/feedbackController");
const router = (0, express_1.Router)();
router.post("/", feedbackController_1.submitFeedback);
router.post("/lesson", feedbackController_1.submitLessonFeedback);
exports.default = router;
