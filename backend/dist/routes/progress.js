"use strict";
// backend/src/routes/progress.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const progressController_1 = require("../controllers/progressController");
const router = (0, express_1.Router)();
router.get("/:userId", progressController_1.getUserProgress);
router.get("/:userId/:lessonId", progressController_1.getLessonProgress);
exports.default = router;
