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
const openaiClient_2 = require("../ai/openaiClient");
const tutorOutputGuard_1 = require("../ai/tutorOutputGuard");
const learnerProfileStore_1 = require("../storage/learnerProfileStore");
const featureFlags_1 = require("../config/featureFlags");
const FORCED_ADVANCE_PRACTICE_THRESHOLD = 2;
function isSupportedLanguage(v) {
    return v === "en" || v === "de" || v === "es" || v === "fr";
}
function normalizeLanguage(v) {
    if (typeof v !== "string")
        return null;
    const t = v.trim().toLowerCase();
    return isSupportedLanguage(t) ? t : null;
}
async function ensureTutorPromptOnResume(session) {
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
    const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText);
    let tutorMessage;
    try {
        tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: session.language });
    }
    catch {
        tutorMessage = "I'm having trouble responding right now. Please try again later.";
    }
    // Drift guard
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
// Helper: map state ->tutor intent
//----------------------
function getTutorIntent(state, isCorrect, markNeedsReview) {
    if (state === "COMPLETE")
        return "END_LESSON";
    if (state === "ADVANCE")
        return markNeedsReview ? "FORCED_ADVANCE" : "ADVANCE_LESSON";
    if (isCorrect === false)
        return "ENCOURAGE_RETRY";
    return "ASK_QUESTION";
}
function chooseHintForAttempt(question, attemptCount) {
    // Attempt 1 -> no hint
    if (attemptCount <= 1)
        return undefined;
    // Support BOTH formats:
    // - hint?: string (legacy)
    // - hints?: string[] (new)
    const hintsArr = Array.isArray(question.hints) ? question.hints : [];
    const legacyHint = typeof question.hint === "string" ? question.hint : "";
    // Attempt 2 -> light hint
    // Attempt 3 -> stronger hint
    if (attemptCount === 2) {
        const text = (hintsArr[0] || legacyHint || "").trim();
        if (!text)
            return undefined;
        return { level: 1, text };
    }
    if (attemptCount === 3) {
        const text = (hintsArr[1] || hintsArr[0] || legacyHint || "").trim();
        if (!text)
            return undefined;
        return { level: 2, text };
    }
    // Attempt 4+ -> reveal answer + short explanation
    const reveal = `Answer: ${question.answer}. Explanation: this is the expected structure for this question.`;
    return { level: 3, text: reveal };
}
function buildProgressPayload(session, lesson, statusOverride) {
    const total = Array.isArray(lesson.questions) ? lesson.questions.length : 0;
    const idx = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
    const safeTotal = total > 0 ? total : 1;
    const clampedIdx = Math.max(0, Math.min(safeTotal - 1, idx));
    const status = statusOverride ?? (session.state === "COMPLETE" ? "completed" : "in_progress");
    return {
        currentQuestionIndex: clampedIdx,
        totalQuestions: safeTotal,
        status,
    };
}
//----------------------
// Start lesson
//----------------------
const startLesson = async (req, res) => {
    const { userId, language, lessonId, restart } = req.body;
    const lang = normalizeLanguage(language);
    if (!userId)
        return res.status(400).json({ error: "UserId is required" });
    if (!lang || !lessonId)
        return res.status(400).json({ error: "Language and lessonId are required" });
    try {
        let session = await sessionState_1.LessonSessionModel.findOne({ userId });
        if (session) {
            const sameLesson = session.lessonId === lessonId && session.language === lang;
            if (sameLesson) {
                if (restart === true) {
                    await progressState_1.LessonProgressModel.deleteOne({ userId });
                    session = null;
                }
                else if (session.state === "COMPLETE") {
                    const resumeLesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
                    const progress = resumeLesson ? buildProgressPayload(session, resumeLesson) : undefined;
                    const tutorMessage = await ensureTutorPromptOnResume(session);
                    return res.status(200).json({
                        session,
                        ...(tutorMessage ? { tutorMessage } : {}),
                        ...(progress ? { progress } : {}),
                    });
                }
                else {
                    const resumeLesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
                    const progress = resumeLesson ? buildProgressPayload(session, resumeLesson) : undefined;
                    const tutorMessage = await ensureTutorPromptOnResume(session);
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
            return res.status(404).json({ error: "Lesson not found" });
        const newSession = {
            userId,
            lessonId,
            state: "USER_INPUT",
            attempts: 0,
            maxAttempts: 4, // Phase 2.2 requires attempt 4+ behavior
            currentQuestionIndex: 0,
            messages: [],
            language: lang,
        };
        const firstQuestion = lesson.questions[0];
        const intent = "ASK_QUESTION";
        const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(newSession, intent, firstQuestion.question);
        let tutorMessage;
        try {
            tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: lang });
        }
        catch {
            tutorMessage = "I'm having trouble responding right now. Please try again later.";
        }
        // Drift guard
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
        // Progress: first interaction => in_progress
        await progressState_1.LessonProgressModel.updateOne({ userId, language: lang, lessonId }, {
            $setOnInsert: { status: "in_progress" },
            $set: {
                currentQuestionIndex: 0,
                lastActiveAt: new Date(),
            },
        }, { upsert: true });
        const progress = buildProgressPayload(session, lesson);
        return res.status(201).json({ session, tutorMessage, progress });
    }
    catch (err) {
        console.error("Start  lesson error", err);
        return res.status(500).json({ error: "Server error" });
    }
};
exports.startLesson = startLesson;
//----------------------
// Submit answer
//----------------------
const submitAnswer = async (req, res) => {
    try {
        const { userId, answer, language, lessonId } = req.body;
        if (!userId || typeof answer !== "string") {
            return res.status(400).json({ error: "Invalid Payload (userId and answer are required)" });
        }
        const session = await sessionState_1.LessonSessionModel.findOne({ userId });
        if (!session)
            return res.status(404).json({ error: "No active session found" });
        // Keep legacy behavior: session fields only set if missing
        if (!session.language && isSupportedLanguage(String(language || "").trim().toLowerCase())) {
            session.language = String(language).trim().toLowerCase();
        }
        if (!session.lessonId && typeof lessonId === "string")
            session.lessonId = lessonId;
        if (!session.language || !session.lessonId) {
            return res.status(409).json({
                error: "Session missing language/lessonId. Please restart the lesson",
                code: "SESSION_INCMPLETE",
            });
        }
        const lesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
        if (!lesson)
            return res.status(404).json({ error: "Lesson not found" });
        // ✅ Phase 4: If lesson is already complete, do NOT accept further answers.
        // Return current session + progress without mutating messages or attempts.
        if (session.state === "COMPLETE") {
            const progress = buildProgressPayload(session, lesson, "completed");
            return res.status(200).json({ progress, session });
        }
        session.messages.push({ role: "user", content: answer });
        const currentIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
        const currentQuestion = lesson.questions[currentIndex];
        if (!currentQuestion) {
            return res.status(409).json({
                error: "Session out of sync with lesson content. Please restart the lesson",
                code: "SESSION_OUT_OF_SYNC",
            });
        }
        // Phase 2.2: per-question attempt count
        const qid = String(currentQuestion.id);
        const practiceCooldown = session.practiceCooldownByQuestionId ?? new Map();
        const practiceCooldownActive = (practiceCooldown.get?.(qid) ?? practiceCooldown[qid] ?? 0) >= 1;
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
        // Evaluation (Phase 2.2)
        const evaluation = (0, answerEvaluator_1.evaluateAnswer)(currentQuestion, answer, session.language);
        const isCorrect = evaluation.result === "correct";
        // Hint selection (Phase 2.2)
        const hintObj = chooseHintForAttempt(currentQuestion, attemptCount);
        const hintForResponse = hintObj && hintObj.level < 3 ? hintObj : hintObj; // include reveal hint too
        const hintTextForPrompt = hintObj ? hintObj.text : "";
        let markNeedsReview = false;
        // Lesson progression rules
        if (isCorrect) {
            attemptMap.set(qid, 0);
            if (currentIndex + 1 >= lesson.questions.length) {
                session.state = "COMPLETE";
            }
            else {
                session.currentQuestionIndex = currentIndex + 1;
                session.state = "ADVANCE";
            }
            // reset cooldown for this question after correct
            const cd = session.practiceCooldownByQuestionId ?? new Map();
            if (typeof cd.set === "function")
                cd.set(qid, 0);
            else
                cd[qid] = 0;
            session.practiceCooldownByQuestionId = cd;
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
                // reset cooldown for this question after forced advance
                const cd = session.practiceCooldownByQuestionId ?? new Map();
                if (typeof cd.set === "function")
                    cd.set(qid, 0);
                else
                    cd[qid] = 0;
                session.practiceCooldownByQuestionId = cd;
            }
            else {
                session.state = "USER_INPUT";
            }
        }
        // ---- Progress persistence (Phase 2.2) ----
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
        const promptQuestion = session.state !== "COMPLETE" ? lesson.questions[session.currentQuestionIndex] : null;
        // ---- Learner profile tracking (BITE 4.1, best-effort; no behavior change) ----
        try {
            await (0, learnerProfileStore_1.recordLessonAttempt)({
                userId: session.userId,
                language: session.language,
                result: evaluation.result,
                reasonCode: evaluation.reasonCode,
                forcedAdvance: markNeedsReview,
                conceptTag: promptQuestion?.conceptTag,
            });
        }
        catch {
            // best-effort: never break lesson flow
        }
        // ---- Deterministic retry message (Phase 2.2) ----
        const intent = getTutorIntent(session.state, isCorrect, markNeedsReview);
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
        const focusNudge = (0, staticTutorMessages_1.getFocusNudge)(topFocusReason);
        const hintLeadInWithFocus = focusNudge && intent === "ENCOURAGE_RETRY" && hintTextForPrompt
            ? `${focusNudge} ${hintLeadIn}`.trim()
            : hintLeadIn;
        const forcedAdvanceMessageWithFocus = focusNudge && intent === "FORCED_ADVANCE"
            ? `${focusNudge} ${forcedAdvanceMessage}`.trim()
            : forcedAdvanceMessage;
        const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText, {
            retryMessage,
            hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
            hintLeadIn: hintLeadInWithFocus,
            forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
            revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
            learnerProfileSummary,
            explanationText: intent === "FORCED_ADVANCE" ? (promptQuestion?.explanation ?? "") : "",
        });
        let tutorMessage;
        try {
            tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: session.language });
        }
        catch {
            tutorMessage = "I'm having trouble responding right now. please try again.";
        }
        // ✅ Drift guard (this is what your failing test expects)
        if (!(0, tutorOutputGuard_1.isTutorMessageAcceptable)({
            intent,
            language: session.language,
            message: tutorMessage,
            questionText,
            retryMessage,
            hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
            hintLeadIn,
            forcedAdvanceMessage,
            revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
        })) {
            tutorMessage = (0, tutorOutputGuard_1.buildTutorFallback)({
                intent,
                language: session.language,
                message: tutorMessage,
                questionText,
                retryMessage,
                hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
                hintLeadIn,
                forcedAdvanceMessage,
                revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
            });
        }
        session.messages.push({ role: "assistant", content: tutorMessage });
        await session.save();
        let practice;
        const practiceConceptTag = typeof currentQuestion.conceptTag === "string" && currentQuestion.conceptTag.trim().length > 0
            ? currentQuestion.conceptTag.trim()
            : `lesson-${session.lessonId}-q${currentQuestion.id}`;
        let allowForcedAdvancePractice = false;
        if (intent === "FORCED_ADVANCE") {
            try {
                const conceptCount = await (0, learnerProfileStore_1.getConceptMistakeCount)(session.userId, session.language, practiceConceptTag);
                allowForcedAdvancePractice = conceptCount >= FORCED_ADVANCE_PRACTICE_THRESHOLD;
            }
            catch {
                allowForcedAdvancePractice = false;
            }
        }
        if (session.state !== "COMPLETE" &&
            (evaluation.result === "almost" || allowForcedAdvancePractice) &&
            (0, featureFlags_1.isPracticeGenEnabled)() &&
            !practiceCooldownActive) {
            try {
                const aiClient = { generatePracticeJSON: openaiClient_2.generatePracticeJSON };
                const conceptTag = practiceConceptTag;
                const practiceType = "variation";
                const { item: practiceItem } = await (0, practiceGenerator_1.generatePracticeItem)({
                    language: session.language,
                    lessonId: session.lessonId,
                    sourceQuestionText: currentQuestion.question,
                    expectedAnswerRaw: currentQuestion.answer,
                    conceptTag,
                    type: practiceType,
                }, aiClient);
                const pb = session.practiceById ?? {};
                const pa = session.practiceAttempts ?? {};
                if (typeof pb.set === "function")
                    pb.set(practiceItem.practiceId, practiceItem);
                else
                    pb[practiceItem.practiceId] = practiceItem;
                if (typeof pa.set === "function") {
                    if (pa.get(practiceItem.practiceId) === undefined)
                        pa.set(practiceItem.practiceId, 0);
                }
                else {
                    if (pa[practiceItem.practiceId] === undefined)
                        pa[practiceItem.practiceId] = 0;
                }
                session.practiceById = pb;
                session.practiceAttempts = pa;
                const cd = session.practiceCooldownByQuestionId ?? new Map();
                if (typeof cd.set === "function")
                    cd.set(qid, 1);
                else
                    cd[qid] = 1;
                session.practiceCooldownByQuestionId = cd;
                await session.save();
                practice = { practiceId: practiceItem.practiceId, prompt: practiceItem.prompt };
            }
            catch {
                practice = undefined;
            }
        }
        const progress = buildProgressPayload(session, lesson, baseStatus);
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
        console.error("Submit answer error:", err);
        return res.status(500).json({ error: "Server error" });
    }
};
exports.submitAnswer = submitAnswer;
//----------------------
// Get session (debug)
//----------------------
const getSessionHandler = async (req, res) => {
    const { userId } = req.params;
    if (!userId)
        return res.status(400).json({ error: "UserId is required" });
    try {
        const session = await sessionState_1.LessonSessionModel.findOne({ userId });
        if (!session)
            return res.status(404).json({ error: "No active sessions found" });
        const tutorMessage = await ensureTutorPromptOnResume(session);
        const lesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
        const progress = lesson ? buildProgressPayload(session, lesson) : undefined;
        return res.status(200).json({
            session,
            messages: session.messages,
            ...(tutorMessage ? { tutorMessage } : {}),
            ...(progress ? { progress } : {}),
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch session" });
    }
};
exports.getSessionHandler = getSessionHandler;
