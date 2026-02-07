"use strict";
// backend/src/controllers/lessonController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionHandler = exports.submitAnswer = exports.startLesson = void 0;
const sessionState_1 = require("../state/sessionState");
const promptBuilder_1 = require("../ai/promptBuilder");
const openaiClient_1 = require("../ai/openaiClient");
const lessonLoader_1 = require("../state/lessonLoader");
const answerEvaluator_1 = require("../state/answerEvaluator");
const staticTutorMessages_1 = require("../ai/staticTutorMessages");
const progressState_1 = require("../state/progressState");
const practiceGenerator_1 = require("../services/practiceGenerator");
const reviewPrompt_1 = require("../services/reviewPrompt");
const tutorOutputGuard_1 = require("../ai/tutorOutputGuard");
const crypto_1 = require("crypto");
const learnerProfileStore_1 = require("../storage/learnerProfileStore");
const featureFlags_1 = require("../config/featureFlags");
const instructionLanguage_1 = require("../utils/instructionLanguage");
const lessonHelpers_1 = require("./lessonHelpers");
const mapLike_1 = require("../utils/mapLike");
const sendError_1 = require("../http/sendError");
const logger_1 = require("../utils/logger");
const FORCED_ADVANCE_PRACTICE_THRESHOLD = 2;
function toMapLike(map) {
    if (map instanceof Map)
        return map;
    const out = new Map();
    if (map && typeof map === "object") {
        Object.entries(map).forEach(([key, value]) => {
            const num = typeof value === "number" ? value : Number(value);
            if (Number.isFinite(num))
                out.set(key, num);
        });
    }
    return out;
}
function pickWeakQuestionIds(lesson, attemptCounts, maxItems = 5) {
    const scored = lesson.questions.map((q, idx) => {
        const qid = String(q.id);
        const attempts = attemptCounts.get(qid) ?? 0;
        return { qid, attempts, idx };
    });
    const weak = scored.filter((s) => s.attempts >= 2);
    if (weak.length === 0)
        return [];
    weak.sort((a, b) => {
        if (b.attempts !== a.attempts)
            return b.attempts - a.attempts;
        return a.idx - b.idx;
    });
    return weak.slice(0, maxItems).map((c) => c.qid);
}
async function buildReviewQueueItems(lesson, lessonId, questionIds, now, language) {
    const items = [];
    for (const qid of questionIds) {
        const q = lesson.questions.find((x) => String(x.id) === qid);
        if (!q)
            continue;
        const conceptTag = q.conceptTag || `lesson-${lessonId}-q${qid}`;
        const expected = String(q.answer ?? "");
        const prompt = await (0, reviewPrompt_1.buildReviewPrompt)({
            language,
            lessonId,
            sourceQuestionText: q.question,
            expectedAnswerRaw: expected,
            examples: q.examples,
            conceptTag,
        });
        items.push({
            id: (0, crypto_1.randomUUID)(),
            lessonId,
            conceptTag,
            prompt,
            expected,
            createdAt: now,
            dueAt: now,
            attempts: 0,
        });
    }
    return items;
}
async function ensureTutorPromptOnResume(session, instructionLanguage) {
    const last = session.messages?.[session.messages.length - 1];
    if (last && last.role === "assistant")
        return null;
    const lesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
    if (!lesson)
        return null;
    const idx = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
    const q = lesson.questions[idx];
    const questionText = q ? q.question : "";
    let intent;
    if (session.state === "COMPLETE")
        intent = "END_LESSON";
    else if (session.state === "ADVANCE")
        intent = "ADVANCE_LESSON";
    else
        intent = "ASK_QUESTION";
    const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText, instructionLanguage ? { instructionLanguage } : undefined);
    let tutorMessage;
    try {
        tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: session.language });
    }
    catch {
        tutorMessage = "I'm having trouble responding right now. Please try again later.";
    }
    if (!(0, tutorOutputGuard_1.isTutorMessageAcceptable)({
        intent,
        language: session.language,
        message: tutorMessage,
        questionText,
    })) {
        tutorMessage = (0, tutorOutputGuard_1.buildTutorFallback)({
            intent,
            language: session.language,
            message: tutorMessage,
            questionText,
        });
    }
    session.messages = session.messages || [];
    session.messages.push({ role: "assistant", content: tutorMessage });
    await session.save();
    return tutorMessage;
}
//----------------------
// Start lesson
//----------------------
const startLesson = async (req, res) => {
    const { userId, language, lessonId, restart, teachingPrefs } = req.body;
    const lang = (0, lessonHelpers_1.normalizeLanguage)(language);
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "UserId is required", "INVALID_REQUEST");
    if (!lang)
        return (0, sendError_1.sendError)(res, 400, "language must be 'en' (English only for now)", "INVALID_REQUEST");
    if (!lessonId)
        return (0, sendError_1.sendError)(res, 400, "lessonId is required", "INVALID_REQUEST");
    try {
        let instructionLanguage = null;
        if (teachingPrefs && typeof learnerProfileStore_1.updateTeachingProfilePrefs === "function") {
            try {
                await (0, learnerProfileStore_1.updateTeachingProfilePrefs)({
                    userId,
                    language: lang,
                    pace: teachingPrefs?.pace,
                    explanationDepth: teachingPrefs?.explanationDepth,
                });
            }
            catch {
                // best-effort: never block lesson start
            }
        }
        if ((0, featureFlags_1.isInstructionLanguageEnabled)()) {
            try {
                const normalizedInstruction = (0, instructionLanguage_1.normalizeLanguage)(teachingPrefs?.instructionLanguage);
                if (normalizedInstruction && typeof learnerProfileStore_1.setInstructionLanguage === "function") {
                    await (0, learnerProfileStore_1.setInstructionLanguage)({
                        userId,
                        language: lang,
                        instructionLanguage: normalizedInstruction,
                    });
                }
            }
            catch {
                // best-effort
            }
            try {
                instructionLanguage =
                    typeof learnerProfileStore_1.getInstructionLanguage === "function" ? await (0, learnerProfileStore_1.getInstructionLanguage)(userId, lang) : null;
            }
            catch {
                instructionLanguage = null;
            }
        }
        let session = await sessionState_1.LessonSessionModel.findOne({ userId });
        if (session) {
            const sameLesson = session.lessonId === lessonId && session.language === lang;
            if (sameLesson) {
                if (restart === true) {
                    await progressState_1.LessonProgressModel.deleteOne({ userId });
                    session = null;
                }
                else {
                    const resumeLesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
                    const progress = resumeLesson ? (0, lessonHelpers_1.buildProgressPayload)(session, resumeLesson) : undefined;
                    const tutorMessage = await ensureTutorPromptOnResume(session, instructionLanguage);
                    return res.status(200).json({
                        session,
                        ...(tutorMessage ? { tutorMessage } : {}),
                        ...(progress ? { progress } : {}),
                    });
                }
            }
            await sessionState_1.LessonSessionModel.deleteOne({ userId });
            session = null;
        }
        const lesson = (0, lessonLoader_1.loadLesson)(lang, lessonId);
        if (!lesson)
            return (0, sendError_1.sendError)(res, 404, "Lesson not found", "NOT_FOUND");
        const newSession = {
            userId,
            lessonId,
            state: "USER_INPUT",
            attempts: 0,
            maxAttempts: 4,
            currentQuestionIndex: 0,
            messages: [],
            language: lang,
        };
        const firstQuestion = lesson.questions[0];
        const intent = "ASK_QUESTION";
        const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(newSession, intent, firstQuestion.question, instructionLanguage ? { instructionLanguage } : undefined);
        let tutorMessage;
        try {
            tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: lang });
        }
        catch {
            tutorMessage = "I'm having trouble responding right now. Please try again later.";
        }
        if (!(0, tutorOutputGuard_1.isTutorMessageAcceptable)({
            intent,
            language: lang,
            message: tutorMessage,
            questionText: firstQuestion.question,
        })) {
            tutorMessage = (0, tutorOutputGuard_1.buildTutorFallback)({
                intent,
                language: lang,
                message: tutorMessage,
                questionText: firstQuestion.question,
            });
        }
        const intitialMessage = { role: "assistant", content: tutorMessage };
        session = await sessionState_1.LessonSessionModel.create({ ...newSession, messages: [intitialMessage] });
        await progressState_1.LessonProgressModel.updateOne({ userId, language: lang, lessonId }, {
            $setOnInsert: { status: "in_progress" },
            $set: {
                currentQuestionIndex: 0,
                lastActiveAt: new Date(),
            },
        }, { upsert: true });
        const progress = (0, lessonHelpers_1.buildProgressPayload)(session, lesson);
        return res.status(201).json({ session, tutorMessage, progress });
    }
    catch (err) {
        (0, logger_1.logServerError)("startLesson", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Server error", "SERVER_ERROR");
    }
};
exports.startLesson = startLesson;
//----------------------
// Submit answer
//----------------------
const submitAnswer = async (req, res) => {
    try {
        const { userId, answer, language, lessonId, teachingPrefs } = req.body;
        if (!userId || typeof answer !== "string") {
            return (0, sendError_1.sendError)(res, 400, "Invalid Payload (userId and answer are required)", "INVALID_REQUEST");
        }
        const session = await sessionState_1.LessonSessionModel.findOne({ userId });
        if (!session)
            return (0, sendError_1.sendError)(res, 404, "No active session found", "NOT_FOUND");
        if (!session.language && (0, lessonHelpers_1.isSupportedLanguage)(String(language || "").trim().toLowerCase())) {
            session.language = String(language).trim().toLowerCase();
        }
        if (!session.lessonId && typeof lessonId === "string")
            session.lessonId = lessonId;
        if (!session.language || !session.lessonId) {
            return (0, sendError_1.sendError)(res, 409, "Session missing language/lessonId. Please restart the lesson", "SESSION_INCMPLETE");
        }
        if (teachingPrefs && typeof learnerProfileStore_1.updateTeachingProfilePrefs === "function") {
            try {
                await (0, learnerProfileStore_1.updateTeachingProfilePrefs)({
                    userId: session.userId,
                    language: session.language,
                    pace: teachingPrefs?.pace,
                    explanationDepth: teachingPrefs?.explanationDepth,
                });
            }
            catch {
                // best-effort: do not block answering
            }
        }
        let instructionLanguage = null;
        if ((0, featureFlags_1.isInstructionLanguageEnabled)()) {
            try {
                const normalizedInstruction = (0, instructionLanguage_1.normalizeLanguage)(teachingPrefs?.instructionLanguage);
                if (normalizedInstruction && typeof learnerProfileStore_1.setInstructionLanguage === "function") {
                    await (0, learnerProfileStore_1.setInstructionLanguage)({
                        userId: session.userId,
                        language: session.language,
                        instructionLanguage: normalizedInstruction,
                    });
                }
            }
            catch {
                // best-effort
            }
            try {
                instructionLanguage =
                    typeof learnerProfileStore_1.getInstructionLanguage === "function"
                        ? await (0, learnerProfileStore_1.getInstructionLanguage)(session.userId, session.language)
                        : null;
            }
            catch {
                instructionLanguage = null;
            }
        }
        const lesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
        if (!lesson)
            return (0, sendError_1.sendError)(res, 404, "Lesson not found", "NOT_FOUND");
        if (session.state === "COMPLETE") {
            const progress = (0, lessonHelpers_1.buildProgressPayload)(session, lesson, "completed");
            return res.status(200).json({ progress, session });
        }
        session.messages.push({ role: "user", content: answer });
        const currentIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
        const currentQuestion = lesson.questions[currentIndex];
        if (!currentQuestion) {
            return (0, sendError_1.sendError)(res, 409, "Session out of sync with lesson content. Please restart the lesson", "SESSION_OUT_OF_SYNC");
        }
        const qid = String(currentQuestion.id);
        const practiceCooldownByQuestionId = session.practiceCooldownByQuestionId;
        const practiceCooldownActive = (0, mapLike_1.mapLikeGetNumber)(practiceCooldownByQuestionId, qid, 0) >= 1;
        const attemptMap = session.attemptCountByQuestionId || new Map();
        const lastAnswerMap = session.lastAnswerByQuestionId || new Map();
        const prevAttemptCount = attemptMap.get(qid) || 0;
        const attemptCount = prevAttemptCount + 1;
        attemptMap.set(qid, attemptCount);
        const prevAnswer = (lastAnswerMap.get(qid) || "").trim().toLowerCase();
        const nowAnswer = answer.trim().toLowerCase();
        const repeatedSameWrong = prevAnswer.length > 0 && prevAnswer === nowAnswer;
        lastAnswerMap.set(qid, nowAnswer);
        session.attemptCountByQuestionId = attemptMap;
        session.lastAnswerByQuestionId = lastAnswerMap;
        const evaluation = (0, answerEvaluator_1.evaluateAnswer)(currentQuestion, answer, session.language);
        const isCorrect = evaluation.result === "correct";
        const hintObj = (0, lessonHelpers_1.chooseHintForAttempt)(currentQuestion, attemptCount);
        const hintForResponse = hintObj;
        const hintTextForPrompt = hintObj ? hintObj.text : "";
        let markNeedsReview = false;
        if (isCorrect) {
            if (currentIndex + 1 >= lesson.questions.length) {
                session.state = "COMPLETE";
            }
            else {
                session.currentQuestionIndex = currentIndex + 1;
                session.state = "ADVANCE";
            }
            const cd0 = session.practiceCooldownByQuestionId ?? new Map();
            session.practiceCooldownByQuestionId = (0, mapLike_1.mapLikeSet)(cd0, qid, 0);
        }
        else {
            if (attemptCount >= 4) {
                markNeedsReview = true;
                if (currentIndex + 1 >= lesson.questions.length) {
                    session.state = "COMPLETE";
                }
                else {
                    session.currentQuestionIndex = currentIndex + 1;
                    session.state = "ADVANCE";
                }
                const cd0 = session.practiceCooldownByQuestionId ?? new Map();
                session.practiceCooldownByQuestionId = (0, mapLike_1.mapLikeSet)(cd0, qid, 0);
            }
            else {
                session.state = "USER_INPUT";
            }
        }
        const baseStatus = session.state === "COMPLETE" ? (markNeedsReview ? "needs_review" : "completed") : "in_progress";
        const updateMistakes = {};
        if (markNeedsReview) {
            updateMistakes[`mistakesByQuestion.${qid}`] = 1;
        }
        await progressState_1.LessonProgressModel.updateOne({ userId: session.userId, language: session.language, lessonId: session.lessonId }, {
            $set: {
                status: baseStatus,
                currentQuestionIndex: session.currentQuestionIndex || 0,
                lastActiveAt: new Date(),
            },
            $inc: {
                attemptsTotal: 1,
                ...(markNeedsReview ? updateMistakes : {}),
            },
        }, { upsert: true });
        try {
            await (0, learnerProfileStore_1.recordLessonAttempt)({
                userId: session.userId,
                language: session.language,
                result: evaluation.result,
                reasonCode: evaluation.reasonCode,
                forcedAdvance: markNeedsReview,
                repeatedWrong: repeatedSameWrong,
                conceptTag: currentQuestion?.conceptTag,
                lessonId: session.lessonId,
                questionId: String(currentQuestion?.id ?? ""),
            });
        }
        catch {
            // ignore
        }
        if (baseStatus === "completed" || baseStatus === "needs_review") {
            try {
                const attemptCounts = toMapLike(session.attemptCountByQuestionId);
                const weakIds = pickWeakQuestionIds(lesson, attemptCounts);
                const now = new Date();
                const items = await buildReviewQueueItems(lesson, session.lessonId, weakIds, now, session.language);
                await (0, learnerProfileStore_1.enqueueReviewQueueItems)({
                    userId: session.userId,
                    language: session.language,
                    items,
                    summary: {
                        lessonId: session.lessonId,
                        completedAt: now,
                        didWell: "You completed the lesson.",
                        focusNext: items.map((i) => i.conceptTag).slice(0, 3),
                    },
                });
            }
            catch {
                // best-effort: never block lesson completion
            }
        }
        const intent = (0, lessonHelpers_1.getTutorIntent)(session.state, isCorrect, markNeedsReview);
        const safeIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
        const questionText = session.state !== "COMPLETE" && lesson.questions[safeIndex] ? lesson.questions[safeIndex].question : "";
        const revealAnswer = intent === "FORCED_ADVANCE" ? String(currentQuestion.answer || "").trim() : "";
        const retryMessage = intent === "ENCOURAGE_RETRY"
            ? (0, staticTutorMessages_1.getDeterministicRetryMessage)({
                reasonCode: evaluation.reasonCode,
                attemptCount,
                repeatedSameWrong,
            })
            : "";
        const forcedAdvanceMessage = intent === "FORCED_ADVANCE" ? (0, staticTutorMessages_1.getForcedAdvanceMessage)() : "";
        const hintLeadIn = intent === "ENCOURAGE_RETRY" && hintTextForPrompt ? (0, staticTutorMessages_1.getHintLeadIn)(attemptCount) : "";
        let teachingPace = "normal";
        let explanationDepth = "normal";
        try {
            const prefs = typeof learnerProfileStore_1.getTeachingProfilePrefs === "function"
                ? await (0, learnerProfileStore_1.getTeachingProfilePrefs)(session.userId, session.language)
                : null;
            if (prefs) {
                teachingPace = prefs.pace;
                explanationDepth = prefs.explanationDepth;
            }
        }
        catch {
            // ignore
        }
        let learnerProfileSummary = null;
        let topFocusReason = null;
        try {
            [learnerProfileSummary, topFocusReason] = await Promise.all([
                (0, learnerProfileStore_1.getLearnerProfileSummary)({ userId: session.userId, language: session.language }),
                (0, learnerProfileStore_1.getLearnerTopFocusReason)({ userId: session.userId, language: session.language }),
            ]);
        }
        catch {
            learnerProfileSummary = null;
            topFocusReason = null;
        }
        let focusNudge = "";
        try {
            if (typeof topFocusReason === "string" && topFocusReason.trim()) {
                focusNudge = (0, staticTutorMessages_1.getFocusNudge)(topFocusReason);
            }
        }
        catch {
            focusNudge = "";
        }
        const pacePrefix = teachingPace === "slow" ? "Take your time." : "";
        const hintLeadInWithFocus = intent === "ENCOURAGE_RETRY" && hintTextForPrompt
            ? [pacePrefix, focusNudge, hintLeadIn]
                .filter((s) => Boolean(s && s.trim()))
                .join(" ")
                .trim()
            : hintLeadIn;
        const forcedAdvanceMessageWithFocus = intent === "FORCED_ADVANCE" ? forcedAdvanceMessage : forcedAdvanceMessage;
        let retryExplanationText = "";
        try {
            retryExplanationText =
                intent === "ENCOURAGE_RETRY"
                    ? (0, staticTutorMessages_1.getDeterministicRetryExplanation)({
                        reasonCode: evaluation.reasonCode,
                        attemptCount,
                        depth: explanationDepth,
                    })
                    : "";
        }
        catch {
            retryExplanationText = "";
        }
        const forcedAdvanceExplanationText = intent === "FORCED_ADVANCE" && explanationDepth !== "short"
            ? typeof currentQuestion?.explanation === "string"
                ? currentQuestion.explanation
                : ""
            : "";
        const explanationTextForPrompt = intent === "ENCOURAGE_RETRY"
            ? retryExplanationText
            : intent === "FORCED_ADVANCE"
                ? forcedAdvanceExplanationText
                : "";
        let tutorPrompt;
        try {
            tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText, {
                retryMessage,
                hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
                hintLeadIn: hintLeadInWithFocus,
                forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
                revealAnswer: "",
                learnerProfileSummary: learnerProfileSummary ?? undefined,
                explanationText: "",
                instructionLanguage: instructionLanguage ?? undefined,
            });
        }
        catch {
            tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText, {
                retryMessage,
                hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
                hintLeadIn,
                forcedAdvanceMessage,
                revealAnswer: "",
                learnerProfileSummary: learnerProfileSummary ?? undefined,
                explanationText: intent === "FORCED_ADVANCE" ? (currentQuestion?.explanation ?? "") : "",
                instructionLanguage: instructionLanguage ?? undefined,
            });
        }
        let tutorMessage;
        try {
            tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: session.language });
        }
        catch {
            tutorMessage = "I'm having trouble responding right now. please try again.";
        }
        if (!(0, tutorOutputGuard_1.isTutorMessageAcceptable)({
            intent,
            language: session.language,
            message: tutorMessage,
            questionText,
            retryMessage,
            hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
            hintLeadIn: hintLeadInWithFocus,
            forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
            revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
        })) {
            tutorMessage = (0, tutorOutputGuard_1.buildTutorFallback)({
                intent,
                language: session.language,
                message: tutorMessage,
                questionText,
                retryMessage,
                hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
                hintLeadIn: hintLeadInWithFocus,
                forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
                revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
            });
        }
        session.messages.push({ role: "assistant", content: tutorMessage });
        await session.save();
        let practice;
        const practiceConceptTag = typeof currentQuestion.conceptTag === "string" && currentQuestion.conceptTag.trim().length > 0
            ? currentQuestion.conceptTag.trim()
            : `lesson-${session.lessonId}-q${currentQuestion.id}`;
        const isForcedAdvance = intent === "FORCED_ADVANCE";
        // Forced-advance practice is gated by concept mistake count threshold
        let allowForcedAdvancePractice = false;
        if (isForcedAdvance) {
            try {
                const conceptCount = await (0, learnerProfileStore_1.getConceptMistakeCount)(session.userId, session.language, practiceConceptTag);
                allowForcedAdvancePractice = conceptCount >= FORCED_ADVANCE_PRACTICE_THRESHOLD;
            }
            catch {
                allowForcedAdvancePractice = false;
            }
        }
        // Core schedule rule:
        // - allow on "almost" (once per question via cooldown)
        // - allow on forced-advance ONLY if threshold met (once per question via cooldown)
        const shouldGeneratePractice = (0, featureFlags_1.isPracticeGenEnabled)() &&
            !practiceCooldownActive &&
            (evaluation.result === "almost" || (isForcedAdvance && allowForcedAdvancePractice));
        if (shouldGeneratePractice) {
            try {
                const aiClient = { generatePracticeJSON: openaiClient_1.generatePracticeJSON };
                const practiceType = "variation";
                const { item: practiceItem } = await (0, practiceGenerator_1.generatePracticeItem)({
                    language: session.language,
                    lessonId: session.lessonId,
                    sourceQuestionText: currentQuestion.question,
                    expectedAnswerRaw: currentQuestion.answer,
                    conceptTag: practiceConceptTag,
                    type: practiceType,
                }, aiClient, { forceEnabled: true });
                // Persist practice item
                let pb = session.practiceById;
                pb = (0, mapLike_1.mapLikeSet)(pb, practiceItem.practiceId, practiceItem);
                // Persist attempts counter (init only once)
                let pa = session.practiceAttempts;
                if (!(0, mapLike_1.mapLikeHas)(pa, practiceItem.practiceId)) {
                    pa = (0, mapLike_1.mapLikeSet)(pa, practiceItem.practiceId, 0);
                }
                session.practiceById = pb;
                session.practiceAttempts = pa;
                // Cooldown this question so we don’t generate repeated practices
                let cd = session.practiceCooldownByQuestionId;
                cd = (0, mapLike_1.mapLikeSet)(cd, qid, 1);
                session.practiceCooldownByQuestionId = cd;
                await session.save();
                practice = { practiceId: practiceItem.practiceId, prompt: practiceItem.prompt };
            }
            catch {
                practice = undefined;
            }
        }
        const progress = (0, lessonHelpers_1.buildProgressPayload)(session, lesson, baseStatus);
        return res.status(200).json({
            progress,
            session,
            tutorMessage,
            evaluation: {
                result: evaluation.result,
                reasonCode: evaluation.reasonCode,
            },
            ...(hintForResponse ? { hint: hintForResponse } : {}),
            ...(practice ? { practice } : {}),
        });
    }
    catch (err) {
        (0, logger_1.logServerError)("submitAnswer", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Server error", "SERVER_ERROR");
    }
};
exports.submitAnswer = submitAnswer;
//----------------------
// Get session (debug)
//----------------------
const getSessionHandler = async (req, res) => {
    const { userId } = req.params;
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "UserId is required", "INVALID_REQUEST");
    try {
        const session = await sessionState_1.LessonSessionModel.findOne({ userId });
        if (!session)
            return (0, sendError_1.sendError)(res, 404, "No active sessions found", "NOT_FOUND");
        let instructionLanguage = null;
        if ((0, featureFlags_1.isInstructionLanguageEnabled)() && session?.language) {
            try {
                instructionLanguage =
                    typeof learnerProfileStore_1.getInstructionLanguage === "function"
                        ? await (0, learnerProfileStore_1.getInstructionLanguage)(session.userId, session.language)
                        : null;
            }
            catch {
                instructionLanguage = null;
            }
        }
        const tutorMessage = await ensureTutorPromptOnResume(session, instructionLanguage);
        const lesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
        const progress = lesson ? (0, lessonHelpers_1.buildProgressPayload)(session, lesson) : undefined;
        return res.status(200).json({
            session,
            messages: session.messages,
            ...(tutorMessage ? { tutorMessage } : {}),
            ...(progress ? { progress } : {}),
        });
    }
    catch (err) {
        (0, logger_1.logServerError)("getSessionHandler", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to fetch session", "SERVER_ERROR");
    }
};
exports.getSessionHandler = getSessionHandler;
