"use strict";
//backend/src/controllers/practiceController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReview = exports.generatePractice = void 0;
const lessonLoader_1 = require("../state/lessonLoader");
const practiceGenerator_1 = require("../services/practiceGenerator");
const openaiClient_1 = require("../ai/openaiClient");
const sessionStore_1 = require("../storage/sessionStore");
const learnerProfileStore_1 = require("../storage/learnerProfileStore");
const mapLike_1 = require("../utils/mapLike");
const sendError_1 = require("../http/sendError");
function isSupportedLanguage(v) {
    return v === "en";
}
function isPracticeMetaType(v) {
    return v === "variation" || v === "dialogue_turn" || v === "cloze";
}
const generatePractice = async (req, res) => {
    const { userId, lessonId, language, sourceQuestionId, type, conceptTag } = req.body ?? {};
    if (typeof userId !== "string" || userId.trim() === "") {
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    }
    if (typeof lessonId !== "string" || lessonId.trim() === "") {
        return (0, sendError_1.sendError)(res, 400, "lessonId is required", "INVALID_REQUEST");
    }
    if (!isSupportedLanguage(language)) {
        return (0, sendError_1.sendError)(res, 400, "language must be 'en' (English only for now)", "INVALID_REQUEST");
    }
    const lesson = (0, lessonLoader_1.loadLesson)(language, lessonId);
    if (!lesson) {
        return (0, sendError_1.sendError)(res, 404, "Lesson not found", "NOT_FOUND");
    }
    let q = typeof sourceQuestionId === "number"
        ? lesson.questions.find((x) => x.id === sourceQuestionId)
        : undefined;
    if (typeof sourceQuestionId === "number" && !q) {
        return (0, sendError_1.sendError)(res, 404, "Source question not found", "NOT_FOUND");
    }
    if (!q) {
        const requestedTag = typeof conceptTag === "string" && conceptTag.trim() ? conceptTag.trim() : "";
        let recentTag = null;
        try {
            recentTag =
                typeof learnerProfileStore_1.getRecentConfusionConceptTag === "function"
                    ? await (0, learnerProfileStore_1.getRecentConfusionConceptTag)(userId, language)
                    : null;
        }
        catch {
            recentTag = null;
        }
        const weakest = await (0, learnerProfileStore_1.getWeakestConceptTag)(userId, language);
        if (requestedTag) {
            q = lesson.questions.find((x) => x.conceptTag === requestedTag);
        }
        if (!q && recentTag) {
            q = lesson.questions.find((x) => x.conceptTag === recentTag);
        }
        if (!q && weakest) {
            q = lesson.questions.find((x) => x.conceptTag === weakest);
        }
        if (!q)
            q = lesson.questions[0];
    }
    if (!q) {
        return (0, sendError_1.sendError)(res, 404, "Source question not found", "NOT_FOUND");
    }
    const practiceType = isPracticeMetaType(type) ? type : "variation";
    const tag = typeof q.conceptTag === "string" && q.conceptTag.trim()
        ? q.conceptTag.trim()
        : typeof conceptTag === "string" && conceptTag.trim()
            ? conceptTag.trim()
            : `lesson-${lessonId}-q${q.id}`;
    const aiClient = {
        generatePracticeJSON: openaiClient_1.generatePracticeJSON,
    };
    const { item: practiceItem, source } = await (0, practiceGenerator_1.generatePracticeItem)({
        language,
        lessonId,
        sourceQuestionText: q.question,
        expectedAnswerRaw: q.answer,
        examples: q.examples,
        conceptTag: tag,
        type: practiceType,
    }, aiClient);
    const session = await (0, sessionStore_1.getSession)(userId);
    if (!session) {
        return (0, sendError_1.sendError)(res, 404, "Session not found. Start a lesson first.", "NOT_FOUND");
    }
    // ---- Practice persistence (Map or object, depending on runtime) ----
    let pb = session.practiceById ?? new Map();
    let pa = session.practiceAttempts ?? new Map();
    pb = (0, mapLike_1.mapLikeSet)(pb, practiceItem.practiceId, practiceItem);
    if (!(0, mapLike_1.mapLikeHas)(pa, practiceItem.practiceId)) {
        pa = (0, mapLike_1.mapLikeSet)(pa, practiceItem.practiceId, 0);
    }
    session.practiceById = pb;
    session.practiceAttempts = pa;
    if (typeof session.markModified === "function") {
        session.markModified("practiceById");
        session.markModified("practiceAttempts");
    }
    await (0, sessionStore_1.updateSession)(session);
    return res.status(200).json({ practiceItem, source });
};
exports.generatePractice = generatePractice;
function parseReviewItems(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object")
            continue;
        const lessonId = typeof entry.lessonId === "string" ? entry.lessonId.trim() : "";
        const questionIdRaw = entry.questionId;
        const questionId = typeof questionIdRaw === "string" ? questionIdRaw.trim() : String(questionIdRaw ?? "").trim();
        if (!lessonId || !questionId)
            continue;
        out.push({ lessonId, questionId });
    }
    return out;
}
const generateReview = async (req, res) => {
    const { userId, language, items } = req.body ?? {};
    if (typeof userId !== "string" || userId.trim() === "") {
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    }
    if (!isSupportedLanguage(language)) {
        return (0, sendError_1.sendError)(res, 400, "language must be 'en' (English only for now)", "INVALID_REQUEST");
    }
    const requested = parseReviewItems(items).slice(0, 2);
    if (requested.length === 0) {
        return (0, sendError_1.sendError)(res, 400, "items are required", "INVALID_REQUEST");
    }
    let session = await (0, sessionStore_1.getSession)(userId);
    if (!session) {
        const fallbackLessonId = requested[0]?.lessonId;
        if (!fallbackLessonId) {
            return (0, sendError_1.sendError)(res, 404, "Session not found. Start a lesson first.", "NOT_FOUND");
        }
        await (0, sessionStore_1.createSession)({
            userId,
            lessonId: fallbackLessonId,
            language,
            state: "COMPLETE",
            attempts: 0,
            maxAttempts: 4,
            currentQuestionIndex: 0,
            messages: [],
            attemptCountByQuestionId: new Map(),
            lastAnswerByQuestionId: new Map(),
            practiceById: new Map(),
            practiceAttempts: new Map(),
            practiceCooldownByQuestionId: new Map(),
        });
        session = await (0, sessionStore_1.getSession)(userId);
    }
    if (!session) {
        return (0, sendError_1.sendError)(res, 404, "Session not found. Start a lesson first.", "NOT_FOUND");
    }
    const aiClient = { generatePracticeJSON: openaiClient_1.generatePracticeJSON };
    const practiceItems = [];
    let pb = session.practiceById ?? new Map();
    let pa = session.practiceAttempts ?? new Map();
    for (const reqItem of requested) {
        const lesson = (0, lessonLoader_1.loadLesson)(language, reqItem.lessonId);
        if (!lesson)
            continue;
        const q = lesson.questions.find((x) => String(x.id) === reqItem.questionId);
        if (!q)
            continue;
        const conceptTag = typeof q.conceptTag === "string" && q.conceptTag.trim()
            ? q.conceptTag.trim()
            : `lesson-${reqItem.lessonId}-q${q.id}`;
        try {
            const { item: practiceItem } = await (0, practiceGenerator_1.generatePracticeItem)({
                language,
                lessonId: reqItem.lessonId,
                sourceQuestionText: q.question,
                expectedAnswerRaw: q.answer,
                examples: q.examples,
                conceptTag,
                type: "variation",
            }, aiClient);
            practiceItem.meta = {
                ...practiceItem.meta,
                reviewRef: { lessonId: reqItem.lessonId, questionId: reqItem.questionId },
            };
            pb = (0, mapLike_1.mapLikeSet)(pb, practiceItem.practiceId, practiceItem);
            if (!(0, mapLike_1.mapLikeHas)(pa, practiceItem.practiceId)) {
                pa = (0, mapLike_1.mapLikeSet)(pa, practiceItem.practiceId, 0);
            }
            practiceItems.push({
                practiceId: practiceItem.practiceId,
                prompt: practiceItem.prompt,
                lessonId: practiceItem.lessonId,
                questionId: reqItem.questionId,
                conceptTag: practiceItem.meta.conceptTag,
            });
        }
        catch {
            // Skip failed item generation (best-effort)
            continue;
        }
    }
    if (practiceItems.length === 0) {
        return (0, sendError_1.sendError)(res, 404, "Review items not found", "NOT_FOUND");
    }
    session.practiceById = pb;
    session.practiceAttempts = pa;
    if (typeof session.markModified === "function") {
        session.markModified("practiceById");
        session.markModified("practiceAttempts");
    }
    await (0, sessionStore_1.updateSession)(session);
    return res.status(200).json({ practice: practiceItems });
};
exports.generateReview = generateReview;
