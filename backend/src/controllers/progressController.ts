// backend/src/controllers/progressController.ts

import { Request, Response } from "express";
import { LessonProgressModel } from "../state/progressState";
import { sendError } from "../http/sendError";
import { logServerError } from "../utils/logger";

// GET /progress/:userId?language=xx
export const getUserProgress = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const language = typeof req.query.language === "string" ? req.query.language.trim().toLowerCase() : undefined;

  try {
    const query: any = { userId };
    if (language) query.language = language;

    const progress = await LessonProgressModel.find(query).sort({ lastActiveAt: -1 });
    return res.status(200).json({ progress });
  } catch (err) {
    logServerError("getUserProgress", err, res.locals?.requestId);
    return sendError(res, 500, "Failed to fetch progress", "SERVER_ERROR");
  }
};

// GET /progress/:userId/:lessonId
export const getLessonProgress = async (req: Request, res: Response) => {
  const { userId, lessonId } = req.params;

  try {
    const doc = await LessonProgressModel.findOne({ userId, lessonId });
    if (!doc) return sendError(res, 404, "No progress found", "NOT_FOUND");

    return res.status(200).json({ progress: doc });
  } catch (err) {
    logServerError("getLessonProgress", err, res.locals?.requestId);
    return sendError(res, 500, "Failed to fetch lesson progress", "SERVER_ERROR");
  }
};
