"use strict";
// backend/src/controllers/reviewController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestReview = suggestReview;
const sendError_1 = require("../http/sendError");
const lessonHelpers_1 = require("./lessonHelpers");
const learnerProfileState_1 = require("../state/learnerProfileState");
const reviewScheduler_1 = require("../services/reviewScheduler");
const logger_1 = require("../utils/logger");
function parseSuggestReviewInput(req) {
    const body = (req.body ?? {});
    const query = (req.query ?? {});
    const userIdRaw = body.userId ?? query.userId;
    const languageRaw = body.language ?? query.language;
    const maxItemsRaw = body.maxItems ?? body.limit ?? query.maxItems ?? query.limit;
    const userId = typeof userIdRaw === "string" ? userIdRaw.trim() : "";
    const language = (0, lessonHelpers_1.normalizeLanguage)(languageRaw);
    const maxItems = typeof maxItemsRaw === "number" || typeof maxItemsRaw === "string"
        ? Math.max(1, Math.min(5, Math.floor(Number(maxItemsRaw))))
        : 2;
    return { userId, language: language ?? "", maxItems };
}
async function suggestReview(req, res) {
    const { userId, language, maxItems } = parseSuggestReviewInput(req);
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    if (!language)
        return (0, sendError_1.sendError)(res, 400, "language must be 'en' (English only for now)", "INVALID_REQUEST");
    try {
        const profile = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { reviewItems: 1 }).lean();
        if (!profile) {
            return res.status(200).json({ items: [], message: "" });
        }
        const items = (0, reviewScheduler_1.suggestReviewItems)({ reviewItems: profile.reviewItems }, { maxItems });
        const message = items.length > 0 ? `Want to review ${items.length} item(s) you struggled with recently?` : "";
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
    }
    catch (err) {
        (0, logger_1.logServerError)("suggestReview", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to get suggested review", "SERVER_ERROR");
    }
}
