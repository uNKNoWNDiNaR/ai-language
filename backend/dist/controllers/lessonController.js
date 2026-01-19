"use strict";
// src/controllers/lessonController.ts
// Day 2 MVP backend lesson loop and retry logic
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionHandler = exports.submitAnswer = exports.startLesson = void 0;
const sessionState_1 = require("../state/sessionState");
const promptBuilder_1 = require("../ai/promptBuilder");
const openaiClient_1 = require("../ai/openaiClient");
const lessonLoader_1 = require("../state/lessonLoader");
const answerEvaluator_1 = require("../state/answerEvaluator");
const staticTutorMessages_1 = require("../ai/staticTutorMessages");
const progressState_1 = require("../state/progressState");
//----------------------
// Helper: map state ->tutor intent
//----------------------
function getTutorIntent(state, isCorrect) {
    if (state === "COMPLETE")
        return "END_LESSON";
    if (state === "ADVANCE")
        return "ADVANCE_LESSON";
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
//----------------------
// Start lesson
//----------------------
const startLesson = async (req, res) => {
    const { userId, language, lessonId } = req.body;
    if (!userId)
        return res.status(400).json({ error: "UserId is required" });
    if (!language || !lessonId)
        return res.status(400).json({ error: "Language and lessonId are required" });
    try {
        let session = await sessionState_1.LessonSessionModel.findOne({ userId });
        if (session) {
            const sameLesson = session.lessonId === lessonId && session.language === language;
            if (sameLesson)
                return res.status(200).json({ session });
            await sessionState_1.LessonSessionModel.deleteOne({ userId });
            session = null;
        }
        const lesson = (0, lessonLoader_1.loadLesson)(language, lessonId);
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
            language,
        };
        const firstQuestion = lesson.questions[0];
        const intent = "ASK_QUESTION";
        const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(newSession, intent, firstQuestion.question);
        let tutorMessage;
        try {
            tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent);
        }
        catch {
            tutorMessage = "I'm having trouble responding right now. Please try again later.";
        }
        const intitialMessage = { role: "assistant", content: tutorMessage };
        session = await sessionState_1.LessonSessionModel.create({ ...newSession, messages: [intitialMessage] });
        // Progress: first interaction => in_progress
        await progressState_1.LessonProgressModel.updateOne({ userId, language: language.trim().toLowerCase(), lessonId }, {
            $setOnInsert: { status: "in_progress" },
            $set: {
                currentQuestionIndex: 0,
                lastActiveAt: new Date(),
            },
        }, { upsert: true });
        return res.status(201).json({ session, tutorMessage });
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
        if (!session.language && typeof language === "string")
            session.language = language.trim().toLowerCase();
        if (!session.lessonId && typeof lessonId === "string")
            session.lessonId = lessonId;
        if (!session.language || !session.lessonId) {
            return res.status(409).json({
                error: "Session missing language/lessonId. Please restart the lesson",
                code: "SESSION_INCMPLETE"
            });
        }
        const lesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
        if (!lesson)
            return res.status(404).json({ error: "Lesson not found" });
        session.messages.push({ role: "user", content: answer });
        const currentIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
        const currentQuestion = lesson.questions[currentIndex];
        if (!currentQuestion) {
            return res.status(409).json({
                error: "Session out of sync with lesson content. Please restart the lesson",
                code: "SESSION_OUT_OF_SYNC"
            });
        }
        // Phase 2.2: per-question attempt count
        const qid = String(currentQuestion.id);
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
        // Lesson progression rules:
        // - correct => advance/reset attempt count for this question
        // - wrong/almost:
        //    - attempt 1-3 => stay on question
        //    - attempt 4+ => move on AND mark needs_review AND count mistake
        if (isCorrect) {
            // reset per-question attempt count after correct
            attemptMap.set(qid, 0);
            if (currentIndex + 1 >= lesson.questions.length) {
                session.state = "COMPLETE";
            }
            else {
                session.currentQuestionIndex = currentIndex + 1;
                session.state = "ADVANCE";
            }
        }
        else {
            // treat almost as retry (still not correct)
            if (attemptCount >= 4) {
                // attempt 4+ => move on & mark review
                markNeedsReview = true;
                if (currentIndex + 1 >= lesson.questions.length) {
                    session.state = "COMPLETE";
                }
                else {
                    session.currentQuestionIndex = currentIndex + 1;
                    session.state = "ADVANCE";
                }
            }
            else {
                // attempts 1-3 => retry same question
                session.state = "USER_INPUT";
            }
        }
        // ---- Progress persistence (Phase 2.2) ----
        // First interaction => in_progress
        // Finish last question => completed (unless needs_review triggered)
        // Repeated failures => needs_review
        const baseStatus = session.state === "COMPLETE"
            ? (markNeedsReview ? "needs_review" : "completed")
            : "in_progress";
        // mistakesByQuestion: increment when forced move-on at attempt 4+
        const updateMistakes = {};
        if (markNeedsReview) {
            updateMistakes[`mistakesByQuestion.${qid}`] = 1;
        }
        await progressState_1.LessonProgressModel.updateOne({ userId: session.userId, language: session.language, lessonId: session.lessonId }, {
            $setOnInsert: { attemptsTotal: 0 },
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
        // ---- Deterministic retry message (Phase 2.2) ----
        const intent = getTutorIntent(session.state, isCorrect);
        const safeIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
        const questionText = session.state !== "COMPLETE" && lesson.questions[safeIndex]
            ? lesson.questions[safeIndex].question
            : "";
        const retryMessage = intent === "ENCOURAGE_RETRY"
            ? (0, staticTutorMessages_1.getDeterministicRetryMessage)({
                reasonCode: evaluation.reasonCode,
                attemptCount,
                repeatedSameWrong,
            })
            : "";
        const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText, {
            retryMessage,
            hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
        });
        let tutorMessage;
        try {
            tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent);
        }
        catch {
            tutorMessage = "I'm having trouble responding right now. please try again.";
        }
        session.messages.push({ role: "assistant", content: tutorMessage });
        await session.save();
        // Phase 2.2 required response additions:
        return res.status(200).json({
            session,
            tutorMessage,
            evaluation: {
                result: evaluation.result,
                reasonCode: evaluation.reasonCode,
            },
            ...(hintForResponse ? { hint: hintForResponse } : {}),
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
        return res.status(200).json({ session, messages: session.messages });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch session" });
    }
};
exports.getSessionHandler = getSessionHandler;
