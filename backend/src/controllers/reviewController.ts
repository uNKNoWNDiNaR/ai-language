// backend/src/controllers/reviewController.ts

import type { Request, Response } from "express";
import { sendError } from "../http/sendError";
import { LearnerProfileModel } from "../state/learnerProfileState";
import { suggestReviewItems } from "../services/reviewScheduler";
import { logServerError } from "../utils/logger";
import type { SupportedLanguage } from "../types";

type SuggestReviewInput = {
  userId?: unknown;
  language?: unknown;
  maxItems?: unknown;
  limit?: unknown;
};

function normalizeLanguage(value: unknown): SupportedLanguage | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (t === "en" || t === "de" || t === "es" || t === "fr") return t as SupportedLanguage;
  return null;
}

function parseSuggestReviewInput(req: Request): { userId: string; language: string; maxItems: number } {
  const body = (req.body ?? {}) as SuggestReviewInput;
  const query = (req.query ?? {}) as SuggestReviewInput;

  const userIdRaw = body.userId ?? query.userId;
  const languageRaw = body.language ?? query.language;
  const maxItemsRaw = body.maxItems ?? body.limit ?? query.maxItems ?? query.limit;

  const userId = typeof userIdRaw === "string" ? userIdRaw.trim() : "";
  const language = normalizeLanguage(languageRaw);

  const maxItems =
    typeof maxItemsRaw === "number" || typeof maxItemsRaw === "string"
      ? Math.max(1, Math.min(5, Math.floor(Number(maxItemsRaw))))
      : 2;

  return { userId, language: language ?? "", maxItems };
}

export async function suggestReview(req: Request, res: Response) {
  const { userId, language, maxItems } = parseSuggestReviewInput(req);

  if (!userId) return sendError(res, 400, "userId is required", "INVALID_REQUEST");
  if (!language)
    return sendError(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");

  try {
    const profile = await LearnerProfileModel.findOne({ userId, language }, { reviewItems: 1 }).lean();

    if (!profile) {
      return res.status(200).json({ items: [], message: "" });
    }

    const items = suggestReviewItems({ reviewItems: (profile as any).reviewItems }, { maxItems });
    const message =
      items.length > 0 ? `Want to review ${items.length} item(s) you struggled with recently?` : "";

    return res.status(200).json({
      items: items.map((item) => ({
        lessonId: item.lessonId,
        questionId: item.questionId,
        conceptTag: item.conceptTag,
        reason: "You struggled with this recently.",
        score: item.score,
        lastSeenAt: item.lastSeenAt.toISOString(),
        mistakeCount: item.mistakeCount,
        confidence: item.confidence,
      })),
      message,
    });
  } catch (err) {
    logServerError("suggestReview", err, res.locals?.requestId);
    return sendError(res, 500, "Failed to get suggested review", "SERVER_ERROR");
  }
}
