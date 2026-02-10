"use strict";
// backend/src/controllers/reviewController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestReview = suggestReview;
exports.debugReview = debugReview;
exports.getReviewSuggested = getReviewSuggested;
exports.submitReview = submitReview;
exports.generateReview = generateReview;
const sendError_1 = require("../http/sendError");
const learnerProfileState_1 = require("../state/learnerProfileState");
const answerEvaluator_1 = require("../state/answerEvaluator");
const staticTutorMessages_1 = require("../ai/staticTutorMessages");
const reviewScheduler_1 = require("../services/reviewScheduler");
const learnerProfileStore_1 = require("../storage/learnerProfileStore");
const reviewScheduler_2 = require("../services/reviewScheduler");
const logger_1 = require("../utils/logger");
const reviewPrompt_1 = require("../services/reviewPrompt");
const lessonLoader_1 = require("../state/lessonLoader");
function normalizeQuestionText(text) {
    return (text || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[?]+$/g, "");
}
function normalizeLanguage(value) {
    if (typeof value !== "string")
        return null;
    const t = value.trim().toLowerCase();
    if (t === "en" || t === "de" || t === "es" || t === "fr")
        return t;
    return null;
}
function buildReviewHint(expected, attemptCount, reasonCode) {
    if (attemptCount < 2)
        return null;
    const cleaned = (expected || "").trim();
    if (!cleaned)
        return null;
    const reason = typeof reasonCode === "string" ? reasonCode.trim().toUpperCase() : "";
    if (reason === "ARTICLE")
        return "Hint: Check the article.";
    if (reason === "WORD_ORDER")
        return "Hint: Check word order.";
    if (reason === "WRONG_LANGUAGE")
        return "Hint: Answer in the target language.";
    if (reason === "TYPO")
        return "Hint: Check spelling or small typos.";
    if (reason === "MISSING_SLOT")
        return "Hint: Something is missing — add the missing word.";
    if (reason === "OTHER")
        return "Hint: Try a simple, natural response.";
    return "Hint: Try again with a simple, natural response.";
}
function parseSuggestReviewInput(req) {
    const body = (req.body ?? {});
    const query = (req.query ?? {});
    const userIdRaw = body.userId ?? query.userId;
    const languageRaw = body.language ?? query.language;
    const maxItemsRaw = body.maxItems ?? body.limit ?? query.maxItems ?? query.limit;
    const userId = typeof userIdRaw === "string" ? userIdRaw.trim() : "";
    const language = normalizeLanguage(languageRaw);
    const maxItems = typeof maxItemsRaw === "number" || typeof maxItemsRaw === "string"
        ? Math.max(1, Math.min(5, Math.floor(Number(maxItemsRaw))))
        : 2;
    return { userId, language: language ?? "", maxItems };
}
function parseReviewQueueLimit(req, fallback = 5) {
    const body = (req.body ?? {});
    const query = (req.query ?? {});
    const maxItemsRaw = body.maxItems ?? body.limit ?? query.maxItems ?? query.limit;
    const maxItems = typeof maxItemsRaw === "number" || typeof maxItemsRaw === "string"
        ? Math.max(1, Math.min(5, Math.floor(Number(maxItemsRaw))))
        : fallback;
    return maxItems;
}
function parseReviewItemKey(key) {
    if (!key)
        return null;
    const idx = key.indexOf("__");
    if (idx <= 0 || idx >= key.length - 2)
        return null;
    const lessonId = key.slice(0, idx).trim();
    let questionId = key.slice(idx + 2).trim();
    if (questionId.startsWith("q"))
        questionId = questionId.slice(1);
    if (!lessonId || !questionId)
        return null;
    return { lessonId, questionId };
}
function pickWeakQuestionIdsFromReviewItems(raw, lessonId, maxItems = 5) {
    if (!raw)
        return [];
    const entries = raw instanceof Map ? Array.from(raw.entries()) : Object.entries(raw);
    const scored = [];
    for (const [key, value] of entries) {
        const item = (value ?? {});
        const parsed = parseReviewItemKey(key);
        const itemLessonId = (item.lessonId ?? parsed?.lessonId ?? "").trim();
        const qid = (item.questionId ?? parsed?.questionId ?? "").trim();
        if (!itemLessonId || itemLessonId !== lessonId || !qid)
            continue;
        const countRaw = typeof item.mistakeCount === "number"
            ? item.mistakeCount
            : typeof item.wrongCount === "number"
                ? item.wrongCount
                : typeof item.forcedAdvanceCount === "number"
                    ? item.forcedAdvanceCount
                    : 1;
        const count = Math.max(1, Math.floor(countRaw));
        const lastSeenAt = item.lastSeenAt ? new Date(item.lastSeenAt).getTime() : 0;
        scored.push({ qid, count, lastSeenAt });
    }
    if (scored.length === 0)
        return [];
    scored.sort((a, b) => {
        if (b.count !== a.count)
            return b.count - a.count;
        if (b.lastSeenAt !== a.lastSeenAt)
            return b.lastSeenAt - a.lastSeenAt;
        return a.qid.localeCompare(b.qid);
    });
    return scored.slice(0, Math.max(1, Math.min(5, maxItems))).map((s) => s.qid);
}
async function suggestReview(req, res) {
    const { userId, language, maxItems } = parseSuggestReviewInput(req);
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    if (!language)
        return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
    try {
        const profile = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { reviewItems: 1 }).lean();
        if (!profile) {
            return res.status(200).json({ items: [], message: "" });
        }
        const rawItems = profile.reviewItems;
        const items = (0, reviewScheduler_2.suggestReviewItems)({ reviewItems: rawItems }, { maxItems });
        // Debug logging removed.
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
async function debugReview(req, res) {
    if (process.env.NODE_ENV === "production") {
        return (0, sendError_1.sendError)(res, 404, "Not found", "NOT_FOUND");
    }
    const { userId, language } = parseSuggestReviewInput(req);
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    if (!language)
        return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
    try {
        const profile = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { reviewItems: 1 }).lean();
        const items = profile?.reviewItems ?? {};
        return res.status(200).json({
            userId,
            language,
            count: items instanceof Map ? items.size : Object.keys(items || {}).length,
            reviewItems: items,
        });
    }
    catch (err) {
        (0, logger_1.logServerError)("debugReview", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to get review debug data", "SERVER_ERROR");
    }
}
async function getReviewSuggested(req, res) {
    const { userId, language } = parseSuggestReviewInput(req);
    const maxItems = parseReviewQueueLimit(req, 5);
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    if (!language)
        return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
    try {
        const snapshot = await (0, learnerProfileStore_1.getReviewQueueSnapshot)(userId, language);
        const reviewQueue = snapshot?.reviewQueue ?? [];
        const summary = snapshot?.lastSummary ?? null;
        const items = (0, reviewScheduler_1.pickDueReviewQueueItems)(reviewQueue, new Date(), maxItems ?? 5);
        const responseItems = [];
        const queueCopy = Array.isArray(reviewQueue) ? [...reviewQueue] : [];
        let queueChanged = false;
        const lessonCache = new Map();
        for (const item of items) {
            let prompt = item.prompt;
            if (item.lessonId && typeof prompt === "string" && prompt.trim()) {
                const cached = lessonCache.get(item.lessonId);
                const lesson = cached !== undefined ? cached : (0, lessonLoader_1.loadLesson)(language, item.lessonId);
                if (!lessonCache.has(item.lessonId))
                    lessonCache.set(item.lessonId, lesson);
                if (lesson) {
                    const match = lesson.questions.find((q) => normalizeQuestionText(q.prompt || q.question) ===
                        normalizeQuestionText(prompt));
                    if (match) {
                        const expected = String(match.answer ?? "");
                        const conceptTag = match.conceptTag || item.conceptTag;
                        prompt = await (0, reviewPrompt_1.buildReviewPrompt)({
                            language: language,
                            lessonId: item.lessonId,
                            sourceQuestionText: match.prompt || match.question,
                            expectedAnswerRaw: expected,
                            examples: match.examples,
                            conceptTag,
                            promptStyle: match.promptStyle,
                        });
                        if (prompt && prompt !== item.prompt) {
                            queueChanged = true;
                            const idx = queueCopy.findIndex((q) => q.id === item.id);
                            if (idx >= 0) {
                                queueCopy[idx] = { ...queueCopy[idx], prompt };
                            }
                        }
                    }
                }
            }
            responseItems.push({
                id: item.id,
                lessonId: item.lessonId,
                conceptTag: item.conceptTag,
                prompt,
                expected: item.expected,
                createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
                dueAt: item.dueAt instanceof Date ? item.dueAt.toISOString() : item.dueAt,
                attempts: item.attempts,
                lastResult: item.lastResult,
            });
        }
        if (queueChanged) {
            await learnerProfileState_1.LearnerProfileModel.updateOne({ userId, language }, {
                $setOnInsert: { userId, language },
                $set: { reviewQueue: queueCopy, lastActiveAt: new Date() },
            }, { upsert: true });
        }
        return res.status(200).json({
            summary: summary ?? null,
            items: responseItems,
        });
    }
    catch (err) {
        (0, logger_1.logServerError)("getReviewSuggested", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to fetch review items", "SERVER_ERROR");
    }
}
async function submitReview(req, res) {
    const body = (req.body ?? {});
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const language = normalizeLanguage(body.language);
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    if (!language)
        return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
    if (!itemId)
        return (0, sendError_1.sendError)(res, 400, "itemId is required", "INVALID_REQUEST");
    if (!answer)
        return (0, sendError_1.sendError)(res, 400, "answer is required", "INVALID_REQUEST");
    try {
        const profile = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { reviewQueue: 1, lastSummary: 1 }).lean();
        const queue = Array.isArray(profile?.reviewQueue)
            ? profile.reviewQueue
            : [];
        const idx = queue.findIndex((item) => item?.id === itemId);
        if (idx < 0)
            return (0, sendError_1.sendError)(res, 404, "Review item not found", "NOT_FOUND");
        const item = queue[idx];
        const expected = typeof item.expected === "string" ? item.expected : "";
        if (!expected) {
            return (0, sendError_1.sendError)(res, 500, "Review item missing expected answer", "SERVER_ERROR");
        }
        const evaluation = (0, answerEvaluator_1.evaluateAnswer)({
            id: 0,
            question: item.prompt,
            prompt: item.prompt,
            answer: expected,
            acceptedAnswers: [],
        }, answer, language);
        const attempts = Math.max(0, item.attempts || 0) + 1;
        const now = new Date();
        const dueAt = (0, reviewScheduler_1.computeNextReviewDueAt)(attempts, evaluation.result, now);
        const updated = {
            ...item,
            attempts,
            lastResult: evaluation.result,
            dueAt,
        };
        queue[idx] = updated;
        await learnerProfileState_1.LearnerProfileModel.updateOne({ userId, language }, {
            $set: { reviewQueue: queue, lastActiveAt: now },
            $setOnInsert: { userId, language },
        }, { upsert: true });
        const dueItems = (0, reviewScheduler_1.pickDueReviewQueueItems)(queue, now, 5);
        const nextItem = dueItems.find((i) => i.id !== itemId) ?? (evaluation.result !== "correct" ? updated : null);
        const retryMessage = (0, staticTutorMessages_1.getDeterministicRetryMessage)({
            reasonCode: evaluation.reasonCode,
            attemptCount: attempts,
            repeatedSameWrong: false,
        });
        let hint = null;
        if (evaluation.result !== "correct") {
            try {
                const lesson = (0, lessonLoader_1.loadLesson)(language, item.lessonId);
                const match = lesson?.questions?.find((q) => q.conceptTag && q.conceptTag === item.conceptTag);
                const hintTarget = typeof match?.hintTarget === "string" ? match.hintTarget.trim() : "";
                const legacyHint = typeof match?.hint === "string" ? match.hint.trim() : "";
                hint = hintTarget || legacyHint || buildReviewHint(expected, attempts, evaluation.reasonCode);
            }
            catch {
                hint = buildReviewHint(expected, attempts, evaluation.reasonCode);
            }
        }
        const tutorMessage = evaluation.result === "correct"
            ? "Nice work. Let's keep going."
            : hint
                ? `${retryMessage}\nHint: ${hint}`.trim()
                : retryMessage;
        return res.status(200).json({
            result: evaluation.result,
            tutorMessage,
            nextItem: nextItem
                ? {
                    id: nextItem.id,
                    lessonId: nextItem.lessonId,
                    conceptTag: nextItem.conceptTag,
                    prompt: nextItem.prompt,
                    expected: nextItem.expected,
                    createdAt: nextItem.createdAt instanceof Date ? nextItem.createdAt.toISOString() : nextItem.createdAt,
                    dueAt: nextItem.dueAt instanceof Date ? nextItem.dueAt.toISOString() : nextItem.dueAt,
                    attempts: nextItem.attempts,
                    lastResult: nextItem.lastResult,
                }
                : null,
            remaining: dueItems.length,
        });
    }
    catch (err) {
        (0, logger_1.logServerError)("submitReview", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to submit review", "SERVER_ERROR");
    }
}
async function generateReview(req, res) {
    const body = (req.body ?? {});
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const language = normalizeLanguage(body.language);
    const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    if (!language)
        return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
    if (!lessonId)
        return (0, sendError_1.sendError)(res, 400, "lessonId is required", "INVALID_REQUEST");
    try {
        const lesson = (0, lessonLoader_1.loadLesson)(language, lessonId);
        if (!lesson)
            return (0, sendError_1.sendError)(res, 404, "Lesson not found", "NOT_FOUND");
        const now = new Date();
        const profile = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { reviewItems: 1 }).lean();
        const weakIds = pickWeakQuestionIdsFromReviewItems(profile?.reviewItems ?? null, lessonId, 5);
        const items = [];
        for (const qid of weakIds) {
            const q = lesson.questions.find((x) => String(x.id) === qid);
            if (!q)
                continue;
            const conceptTag = q.conceptTag || `lesson-${lessonId}-q${qid}`;
            const expected = String(q.answer ?? "");
            const prompt = await (0, reviewPrompt_1.buildReviewPrompt)({
                language,
                lessonId,
                sourceQuestionText: q.prompt || q.question,
                expectedAnswerRaw: expected,
                examples: q.examples,
                conceptTag,
                promptStyle: q.promptStyle,
            });
            items.push({
                id: `${lessonId}-${qid}-${now.getTime()}`,
                lessonId,
                conceptTag,
                prompt,
                expected,
                createdAt: now,
                dueAt: now,
                attempts: 0,
            });
        }
        await (0, learnerProfileStore_1.enqueueReviewQueueItems)({
            userId,
            language,
            items,
            summary: {
                lessonId,
                completedAt: now,
                didWell: "You completed the lesson.",
                focusNext: items.map((i) => i.conceptTag).slice(0, 3),
            },
        });
        return res.status(200).json({ added: items.length });
    }
    catch (err) {
        (0, logger_1.logServerError)("generateReview", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to generate review items", "SERVER_ERROR");
    }
}
