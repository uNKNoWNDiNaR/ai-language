"use strict";
// backend/src/controllers/progressController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLessonProgress = exports.getUserProgress = void 0;
const progressState_1 = require("../state/progressState");
// GET /progress/:userId?language=xx
const getUserProgress = async (req, res) => {
    const { userId } = req.params;
    const language = typeof req.query.language === "string" ? req.query.language.trim().toLowerCase() : undefined;
    try {
        const query = { userId };
        if (language)
            query.language = language;
        const progress = await progressState_1.LessonProgressModel.find(query).sort({ lastActiveAt: -1 });
        return res.status(200).json({ progress });
    }
    catch (err) {
        console.error("getUserProgress error", err);
        return res.status(500).json({ error: "Failed to fetch progress" });
    }
};
exports.getUserProgress = getUserProgress;
// GET /progress/:userId/:lessonId
const getLessonProgress = async (req, res) => {
    const { userId, lessonId } = req.params;
    try {
        const doc = await progressState_1.LessonProgressModel.findOne({ userId, lessonId });
        if (!doc)
            return res.status(404).json({ error: "No progress found" });
        return res.status(200).json({ progress: doc });
    }
    catch (err) {
        console.error("getLessonProgress error", err);
        return res.status(500).json({ error: "Failed to fetch lesson progress" });
    }
};
exports.getLessonProgress = getLessonProgress;
