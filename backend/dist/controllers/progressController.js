"use strict";
// backend/src/controllers/progressController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLessonProgress = exports.getUserProgress = void 0;
const progressState_1 = require("../state/progressState");
const sendError_1 = require("../http/sendError");
const logger_1 = require("../utils/logger");
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
        (0, logger_1.logServerError)("getUserProgress", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to fetch progress", "SERVER_ERROR");
    }
};
exports.getUserProgress = getUserProgress;
// GET /progress/:userId/:lessonId
const getLessonProgress = async (req, res) => {
    const { userId, lessonId } = req.params;
    try {
        const doc = await progressState_1.LessonProgressModel.findOne({ userId, lessonId });
        if (!doc)
            return (0, sendError_1.sendError)(res, 404, "No progress found", "NOT_FOUND");
        return res.status(200).json({ progress: doc });
    }
    catch (err) {
        (0, logger_1.logServerError)("getLessonProgress", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to fetch lesson progress", "SERVER_ERROR");
    }
};
exports.getLessonProgress = getLessonProgress;
