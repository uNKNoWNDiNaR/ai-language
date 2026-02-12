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
const supportLevelService_1 = require("../services/supportLevelService");
const supportSectionBuilder_1 = require("../services/supportSectionBuilder");
const supportPolicy_1 = require("../ai/supportPolicy");
const supportLevel_1 = require("../utils/supportLevel");
const FORCED_ADVANCE_PRACTICE_THRESHOLD = 2;
function normalizeTransitionLanguage(instructionLanguage, fallback) {
    return instructionLanguage ?? fallback;
}
function buildTransitionMessage(intent, questionText, language) {
    const q = (questionText || "").trim();
    if (intent === "ASK_QUESTION") {
        return [(0, staticTutorMessages_1.getStartTransition)(language), q].filter(Boolean).join("\n");
    }
    if (intent === "ADVANCE_LESSON") {
        return [(0, staticTutorMessages_1.getAdvanceTransition)(language), (0, staticTutorMessages_1.getNextQuestionLabel)(language), q]
            .filter(Boolean)
            .join("\n");
    }
    if (intent === "FORCED_ADVANCE") {
        return [(0, staticTutorMessages_1.getForcedAdvanceMessage)(language), (0, staticTutorMessages_1.getNextQuestionLabel)(language), q]
            .filter(Boolean)
            .join("\n");
    }
    if (intent === "END_LESSON") {
        return (0, staticTutorMessages_1.getEndLessonMessage)(language);
    }
    return q;
}
const DEFAULT_SUPPORT_LEVEL = "high";
function isExplicitSupportRequest(answer) {
    const t = String(answer || "").trim().toLowerCase();
    if (!t)
        return false;
    return (t.includes("explain") ||
        t.includes("help") ||
        t.includes("english") ||
        t.includes("deutsch") ||
        t.includes("german") ||
        t.includes("spanish") ||
        t.includes("french"));
}
function normalizeTeachingPace(value) {
    return value === "slow" ? "slow" : "normal";
}
function normalizeExplanationDepthPref(value) {
    return value === "short" || value === "detailed" ? value : "normal";
}
function normalizeSupportLevelPref(value) {
    return (0, supportLevel_1.normalizeSupportLevel)(value) ?? DEFAULT_SUPPORT_LEVEL;
}
function resolveSupportEventType(args) {
    if (args.intent === "END_LESSON")
        return "SESSION_SUMMARY";
    if (args.intent === "FORCED_ADVANCE")
        return "FORCED_ADVANCE";
    if (args.explicitSupportRequest)
        return "USER_REQUESTED_EXPLAIN";
    if (args.repeatedConfusion)
        return "USER_CONFUSED";
    if (args.hintPresent)
        return "HINT_AUTO";
    if (args.newConcept && (args.intent === "ASK_QUESTION" || args.intent === "ADVANCE_LESSON")) {
        return "INTRO_NEW_CONCEPT";
    }
    if (args.evaluationResult === "almost")
        return "ALMOST_FEEDBACK";
    if (args.evaluationResult === "wrong")
        return "WRONG_FEEDBACK";
    if (args.evaluationResult === "correct")
        return "CORRECT_FEEDBACK";
    return "SESSION_START";
}
function updateRecentConfusions(session, conceptTag, isIncorrect, forcedAdvance) {
    if (!conceptTag)
        return false;
    const list = Array.isArray(session.recentConfusions) ? session.recentConfusions : [];
    if (isIncorrect || forcedAdvance) {
        list.push({ conceptTag, timestamp: new Date() });
    }
    const trimmed = list.slice(-10);
    session.recentConfusions = trimmed;
    const count = trimmed.filter((entry) => entry?.conceptTag === conceptTag).length;
    return forcedAdvance || count >= 2;
}
function getConceptTag(question, lessonId) {
    if (question && typeof question.conceptTag === "string" && question.conceptTag.trim()) {
        return question.conceptTag.trim();
    }
    if (lessonId && question?.id != null) {
        return `lesson-${lessonId}-q${String(question.id)}`;
    }
    return "";
}
function buildQuestionMeta(question) {
    if (!question)
        return null;
    const promptRaw = typeof question.prompt === "string" ? question.prompt.trim() : "";
    const questionRaw = typeof question.question === "string" ? question.question.trim() : "";
    const prompt = promptRaw || questionRaw;
    if (!prompt)
        return null;
    const taskType = question?.taskType === "speaking" ? "speaking" : "typing";
    const expectedInputRaw = typeof question?.expectedInput === "string" ? question.expectedInput.trim().toLowerCase() : "";
    const expectedInput = expectedInputRaw === "blank" || expectedInputRaw === "sentence"
        ? expectedInputRaw
        : undefined;
    const idRaw = question?.id ?? "";
    const conceptTag = typeof question?.conceptTag === "string" ? question.conceptTag.trim() : "";
    const promptStyle = typeof question?.promptStyle === "string" ? question.promptStyle.trim() : "";
    const base = expectedInput
        ? { id: idRaw, prompt, taskType, expectedInput }
        : { id: idRaw, prompt, taskType };
    return {
        ...base,
        ...(conceptTag ? { conceptTag } : {}),
        ...(promptStyle ? { promptStyle } : {}),
    };
}
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
            sourceQuestionText: q.prompt || q.question,
            expectedAnswerRaw: expected,
            examples: q.examples,
            conceptTag,
            promptStyle: q.promptStyle,
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
async function ensureTutorPromptOnResume(session, instructionLanguage, teachingPrefs) {
    const last = session.messages?.[session.messages.length - 1];
    if (last && last.role === "assistant")
        return null;
    const lesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
    if (!lesson)
        return null;
    const idx = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
    const q = lesson.questions[idx];
    const questionText = q ? (q.prompt || q.question) : "";
    const conceptTag = q ? getConceptTag(q, session.lessonId) : "";
    let intent;
    if (session.state === "COMPLETE")
        intent = "END_LESSON";
    else if (session.state === "ADVANCE")
        intent = "ADVANCE_LESSON";
    else
        intent = "ASK_QUESTION";
    const pace = normalizeTeachingPace(teachingPrefs.pace);
    const explanationDepth = normalizeExplanationDepthPref(teachingPrefs.explanationDepth);
    const supportLevel = normalizeSupportLevelPref(teachingPrefs.supportLevel);
    const policy = (0, supportPolicy_1.computeSupportPolicy)({
        intent,
        pace,
        explanationDepth,
        supportLevel,
        instructionLanguage: instructionLanguage ?? undefined,
        lessonLanguage: session.language,
        attemptCount: 1,
        isFirstQuestion: idx === 0,
    });
    let includeSupport = policy.includeSupport;
    if (session.forceNoSupport)
        includeSupport = false;
    const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText, {
        ...(instructionLanguage ? { instructionLanguage } : {}),
        supportLevel,
        supportTextDirective: includeSupport ? "include" : "omit",
        eventType: "SESSION_START",
        includeSupport,
        conceptTag,
        pace,
        explanationDepth,
        attemptCount: 1,
        isFirstQuestion: idx === 0,
    });
    let tutorMessage;
    let supportText = "";
    try {
        const response = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: session.language });
        tutorMessage = response.primaryText;
        if (!(0, tutorOutputGuard_1.validateJsonShape)(response)) {
            tutorMessage = "";
        }
    }
    catch {
        tutorMessage = "I'm having trouble responding right now. Please try again later.";
    }
    if (!(0, tutorOutputGuard_1.validatePrimaryLanguage)(tutorMessage, session.language) ||
        !(0, tutorOutputGuard_1.isTutorMessageAcceptable)({
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
    const transitionLanguage = normalizeTransitionLanguage(instructionLanguage, session.language);
    tutorMessage = buildTransitionMessage(intent, questionText, transitionLanguage);
    if (includeSupport) {
        supportText = (0, supportSectionBuilder_1.buildSupportSection)({
            lessonLanguage: session.language,
            instructionLanguage: instructionLanguage ?? undefined,
            supportLanguageStyle: policy.supportLanguageStyle,
            maxSupportBullets: policy.maxSupportBullets,
            explanationDepth,
            eventType: "SESSION_START",
            conceptTag,
            hintTarget: typeof q?.hintTarget === "string" ? q.hintTarget : undefined,
            explanationTarget: typeof q?.explanationTarget === "string" ? q.explanationTarget : undefined,
            hintSupport: typeof q?.hintSupport === "string" ? q.hintSupport : undefined,
            explanationSupport: typeof q?.explanationSupport === "string" ? q.explanationSupport : undefined,
        });
    }
    else {
        supportText = "";
    }
    const combinedMessage = supportText ? `${tutorMessage}\n\n${supportText}` : tutorMessage;
    session.messages = session.messages || [];
    session.messages.push({ role: "assistant", content: combinedMessage });
    await session.save();
    return combinedMessage;
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
        return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
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
                    supportLevel: teachingPrefs?.supportLevel,
                    supportMode: teachingPrefs?.supportMode,
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
        let storedTeachingPrefs = null;
        try {
            storedTeachingPrefs =
                typeof learnerProfileStore_1.getTeachingProfilePrefs === "function"
                    ? await (0, learnerProfileStore_1.getTeachingProfilePrefs)(userId, lang)
                    : null;
        }
        catch {
            storedTeachingPrefs = null;
        }
        const resolvedTeachingPrefs = {
            pace: normalizeTeachingPace(teachingPrefs?.pace ?? storedTeachingPrefs?.pace),
            explanationDepth: normalizeExplanationDepthPref(teachingPrefs?.explanationDepth ?? storedTeachingPrefs?.explanationDepth),
            supportLevel: normalizeSupportLevelPref(teachingPrefs?.supportLevel ?? storedTeachingPrefs?.supportLevel),
        };
        let session = await sessionState_1.LessonSessionModel.findOne({ userId, language: lang }, undefined, { sort: { updatedAt: -1 } });
        if (session) {
            const sameLesson = session.lessonId === lessonId && session.language === lang;
            if (sameLesson) {
                if (restart === true) {
                    await progressState_1.LessonProgressModel.deleteOne({ userId, language: lang, lessonId });
                    session = null;
                }
                else {
                    const resumeLesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
                    const progress = resumeLesson ? (0, lessonHelpers_1.buildProgressPayload)(session, resumeLesson) : undefined;
                    const resumeQuestion = resumeLesson?.questions?.[session.currentQuestionIndex ?? 0];
                    const question = buildQuestionMeta(resumeQuestion);
                    const tutorMessage = await ensureTutorPromptOnResume(session, instructionLanguage, resolvedTeachingPrefs);
                    return res.status(200).json({
                        session,
                        ...(tutorMessage ? { tutorMessage } : {}),
                        ...(progress ? { progress } : {}),
                        ...(question ? { question } : {}),
                    });
                }
            }
            await sessionState_1.LessonSessionModel.deleteOne({ userId, language: lang });
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
            ...(typeof teachingPrefs?.forceNoSupport === "boolean"
                ? { forceNoSupport: teachingPrefs.forceNoSupport }
                : {}),
        };
        const firstQuestion = lesson.questions[0];
        const firstQuestionText = firstQuestion ? (firstQuestion.prompt || firstQuestion.question) : "";
        const firstConceptTag = getConceptTag(firstQuestion, lessonId);
        if (firstConceptTag) {
            const seen = new Map();
            seen.set(firstConceptTag, 1);
            newSession.seenConceptTags = seen;
        }
        const intent = "ASK_QUESTION";
        const pace = normalizeTeachingPace(resolvedTeachingPrefs.pace);
        const explanationDepth = normalizeExplanationDepthPref(resolvedTeachingPrefs.explanationDepth);
        const supportLevel = normalizeSupportLevelPref(resolvedTeachingPrefs.supportLevel);
        const policy = (0, supportPolicy_1.computeSupportPolicy)({
            intent,
            pace,
            explanationDepth,
            supportLevel,
            instructionLanguage: instructionLanguage ?? undefined,
            lessonLanguage: lang,
            attemptCount: 1,
            isFirstQuestion: true,
        });
        let includeSupport = policy.includeSupport;
        if (newSession.forceNoSupport)
            includeSupport = false;
        const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(newSession, intent, firstQuestionText, {
            ...(instructionLanguage ? { instructionLanguage } : {}),
            supportLevel,
            supportTextDirective: includeSupport ? "include" : "omit",
            eventType: "SESSION_START",
            includeSupport,
            conceptTag: firstConceptTag,
            pace,
            explanationDepth,
            attemptCount: 1,
            isFirstQuestion: true,
        });
        let tutorMessage;
        let supportText = "";
        try {
            const response = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: lang });
            tutorMessage = response.primaryText;
            if (!(0, tutorOutputGuard_1.validateJsonShape)(response)) {
                tutorMessage = "";
            }
        }
        catch {
            tutorMessage = "I'm having trouble responding right now. Please try again later.";
        }
        if (!(0, tutorOutputGuard_1.validatePrimaryLanguage)(tutorMessage, lang) ||
            !(0, tutorOutputGuard_1.isTutorMessageAcceptable)({
                intent,
                language: lang,
                message: tutorMessage,
                questionText: firstQuestionText,
            })) {
            tutorMessage = (0, tutorOutputGuard_1.buildTutorFallback)({
                intent,
                language: lang,
                message: tutorMessage,
                questionText: firstQuestionText,
            });
        }
        const transitionLanguage = normalizeTransitionLanguage(instructionLanguage, lang);
        tutorMessage = buildTransitionMessage(intent, firstQuestionText, transitionLanguage);
        if (includeSupport) {
            supportText = (0, supportSectionBuilder_1.buildSupportSection)({
                lessonLanguage: lang,
                instructionLanguage: instructionLanguage ?? undefined,
                supportLanguageStyle: policy.supportLanguageStyle,
                maxSupportBullets: policy.maxSupportBullets,
                explanationDepth,
                eventType: "SESSION_START",
                conceptTag: firstConceptTag,
                hintTarget: typeof firstQuestion?.hintTarget === "string" ? firstQuestion.hintTarget : undefined,
                explanationTarget: typeof firstQuestion?.explanationTarget === "string"
                    ? firstQuestion.explanationTarget
                    : undefined,
                hintSupport: typeof firstQuestion?.hintSupport === "string" ? firstQuestion.hintSupport : undefined,
                explanationSupport: typeof firstQuestion?.explanationSupport === "string"
                    ? firstQuestion.explanationSupport
                    : undefined,
            });
        }
        else {
            supportText = "";
        }
        const combinedMessage = supportText ? `${tutorMessage}\n\n${supportText}` : tutorMessage;
        const intitialMessage = { role: "assistant", content: combinedMessage };
        session = await sessionState_1.LessonSessionModel.create({ ...newSession, messages: [intitialMessage] });
        await progressState_1.LessonProgressModel.updateOne({ userId, language: lang, lessonId }, {
            $set: {
                status: "in_progress",
                currentQuestionIndex: 0,
                lastActiveAt: new Date(),
            },
        }, { upsert: true });
        const progress = (0, lessonHelpers_1.buildProgressPayload)(session, lesson);
        const question = buildQuestionMeta(firstQuestion);
        return res.status(201).json({
            session,
            tutorMessage: combinedMessage,
            progress,
            ...(question ? { question } : {}),
        });
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
        const normalizedLanguage = typeof language === "string" && language.trim() ? (0, lessonHelpers_1.normalizeLanguage)(language) : null;
        if (language != null && !normalizedLanguage) {
            return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
        }
        const sessionQuery = { userId };
        if (normalizedLanguage)
            sessionQuery.language = normalizedLanguage;
        if (typeof lessonId === "string" && lessonId.trim()) {
            sessionQuery.lessonId = lessonId.trim();
        }
        const session = await sessionState_1.LessonSessionModel.findOne(sessionQuery, undefined, {
            sort: { updatedAt: -1 },
        });
        if (!session)
            return (0, sendError_1.sendError)(res, 404, "No active session found", "NOT_FOUND");
        if (!session.language && normalizedLanguage) {
            session.language = normalizedLanguage;
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
                    supportLevel: teachingPrefs?.supportLevel,
                    supportMode: teachingPrefs?.supportMode,
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
        let storedTeachingPrefs = null;
        try {
            storedTeachingPrefs =
                typeof learnerProfileStore_1.getTeachingProfilePrefs === "function"
                    ? await (0, learnerProfileStore_1.getTeachingProfilePrefs)(session.userId, session.language)
                    : null;
        }
        catch {
            storedTeachingPrefs = null;
        }
        const resolvedTeachingPrefs = {
            pace: normalizeTeachingPace(teachingPrefs?.pace ?? storedTeachingPrefs?.pace),
            explanationDepth: normalizeExplanationDepthPref(teachingPrefs?.explanationDepth ?? storedTeachingPrefs?.explanationDepth),
            supportLevel: normalizeSupportLevelPref(teachingPrefs?.supportLevel ?? storedTeachingPrefs?.supportLevel),
        };
        const pace = normalizeTeachingPace(resolvedTeachingPrefs.pace);
        const explanationDepth = normalizeExplanationDepthPref(resolvedTeachingPrefs.explanationDepth);
        const supportLevel = normalizeSupportLevelPref(resolvedTeachingPrefs.supportLevel);
        const supportLevelNumber = (0, supportLevel_1.supportLevelToNumber)(supportLevel);
        if (typeof teachingPrefs?.forceNoSupport === "boolean") {
            session.forceNoSupport = teachingPrefs.forceNoSupport;
        }
        const forceNoSupport = Boolean(session.forceNoSupport);
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
        const reviewAfterAttempts = !isCorrect && attemptCount >= 3;
        const conceptTag = getConceptTag(currentQuestion, session.lessonId);
        const conceptMap = session.mistakeCountByConceptTag ?? new Map();
        if (!isCorrect && conceptTag) {
            const prev = (0, mapLike_1.mapLikeGetNumber)(conceptMap, conceptTag, 0);
            session.mistakeCountByConceptTag = (0, mapLike_1.mapLikeSet)(conceptMap, conceptTag, prev + 1);
        }
        else if (conceptTag && !session.mistakeCountByConceptTag) {
            session.mistakeCountByConceptTag = conceptMap;
        }
        if (!isCorrect) {
            if (evaluation.result === "almost") {
                session.almostCount = (session.almostCount || 0) + 1;
            }
            else {
                session.wrongCount = (session.wrongCount || 0) + 1;
            }
        }
        const explicitSupportRequest = isExplicitSupportRequest(answer);
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
                session.forcedAdvanceCount = (session.forcedAdvanceCount || 0) + 1;
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
        const repeatedConfusion = updateRecentConfusions(session, conceptTag, !isCorrect, markNeedsReview);
        let baseStatus = session.state === "COMPLETE" ? (markNeedsReview ? "needs_review" : "completed") : "in_progress";
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
                repeatedWrong: repeatedSameWrong || reviewAfterAttempts,
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
        if (baseStatus === "completed" || baseStatus === "needs_review") {
            try {
                const stats = {
                    wrongCount: Number(session.wrongCount || 0),
                    almostCount: Number(session.almostCount || 0),
                    forcedAdvanceCount: Number(session.forcedAdvanceCount || 0),
                    hintsUsedCount: Number(session.hintsUsedCount || 0),
                };
                const delta = (0, supportLevelService_1.computeSupportLevelDelta)(stats, supportLevelNumber);
                if (delta !== 0) {
                    await (0, supportLevelService_1.updateSupportLevel)(session.userId, session.language, delta);
                }
            }
            catch {
                // best-effort
            }
        }
        const intent = (0, lessonHelpers_1.getTutorIntent)(session.state, isCorrect, markNeedsReview);
        const safeIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
        const nextQuestion = session.state !== "COMPLETE" && lesson.questions[safeIndex] ? lesson.questions[safeIndex] : null;
        const questionText = nextQuestion ? (nextQuestion.prompt || nextQuestion.question) : "";
        const nextConceptTag = nextQuestion ? getConceptTag(nextQuestion, session.lessonId) : "";
        const seenConceptTags = session.seenConceptTags ?? new Map();
        const hasSeenConcept = nextConceptTag
            ? (0, mapLike_1.mapLikeGetNumber)(seenConceptTags, nextConceptTag, 0) > 0
            : false;
        const newConcept = nextConceptTag ? !hasSeenConcept : false;
        if (nextConceptTag && !hasSeenConcept) {
            session.seenConceptTags = (0, mapLike_1.mapLikeSet)(seenConceptTags, nextConceptTag, 1);
        }
        else if (!session.seenConceptTags) {
            session.seenConceptTags = seenConceptTags;
        }
        const hintEvent = !isCorrect && attemptCount >= 2 && attemptCount < 4;
        const eventType = resolveSupportEventType({
            intent,
            evaluationResult: evaluation.result,
            attemptCount,
            hintPresent: hintEvent,
            newConcept,
            explicitSupportRequest,
            repeatedConfusion,
        });
        const policy = (0, supportPolicy_1.computeSupportPolicy)({
            intent,
            pace,
            explanationDepth,
            supportLevel,
            instructionLanguage: instructionLanguage ?? undefined,
            lessonLanguage: session.language,
            attemptCount,
            isFirstQuestion: currentIndex === 0,
        });
        let includeSupport = policy.includeSupport;
        if (forceNoSupport)
            includeSupport = false;
        const hintObj = (0, lessonHelpers_1.chooseHintForAttempt)(currentQuestion, attemptCount, {
            instructionLanguage: instructionLanguage ?? undefined,
            targetLanguage: session.language,
            supportLevel: supportLevelNumber,
            recentConfusion: repeatedConfusion,
            includeSupport,
        });
        const hintTextForPrompt = hintObj?.text ?? "";
        const hintForResponse = hintObj ? { level: hintObj.level, text: hintObj.text } : undefined;
        if (hintObj && hintObj.level >= 1 && hintObj.level < 3) {
            session.hintsUsedCount = (session.hintsUsedCount || 0) + 1;
        }
        let supportText = "";
        const revealAnswer = intent === "FORCED_ADVANCE" ? String(currentQuestion.answer || "").trim() : "";
        const transitionLanguage = normalizeTransitionLanguage(instructionLanguage, session.language);
        const retryMessage = intent === "ENCOURAGE_RETRY"
            ? (0, staticTutorMessages_1.getDeterministicRetryMessage)({
                reasonCode: evaluation.reasonCode,
                attemptCount,
                repeatedSameWrong,
                language: transitionLanguage,
            })
            : "";
        const forcedAdvanceMessage = intent === "FORCED_ADVANCE" ? (0, staticTutorMessages_1.getForcedAdvanceMessage)(transitionLanguage) : "";
        const hintLeadIn = intent === "ENCOURAGE_RETRY" && hintTextForPrompt
            ? (0, staticTutorMessages_1.getHintLeadIn)(attemptCount, transitionLanguage)
            : "";
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
                focusNudge = (0, staticTutorMessages_1.getFocusNudge)(topFocusReason, transitionLanguage);
            }
        }
        catch {
            focusNudge = "";
        }
        const pacePrefix = pace === "slow" ? (0, staticTutorMessages_1.getPacePrefix)(transitionLanguage) : "";
        const hintLeadInWithFocus = intent === "ENCOURAGE_RETRY" && hintTextForPrompt
            ? (pacePrefix || focusNudge || hintLeadIn)
            : hintLeadIn;
        const forcedAdvanceMessageWithFocus = intent === "FORCED_ADVANCE" ? forcedAdvanceMessage : forcedAdvanceMessage;
        const eventConceptTag = intent === "ENCOURAGE_RETRY" || intent === "FORCED_ADVANCE" ? conceptTag : nextConceptTag;
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
        let tutorMessage = "";
        if (intent === "ENCOURAGE_RETRY") {
            const lines = [];
            const retryLine = retryMessage;
            if (retryLine)
                lines.push(retryLine);
            const showPrimaryHint = !includeSupport && Boolean(hintTextForPrompt);
            if (showPrimaryHint) {
                if (hintLeadInWithFocus)
                    lines.push(hintLeadInWithFocus);
                const hintLabel = (0, staticTutorMessages_1.getHintLabel)(transitionLanguage);
                const hintLine = `${hintLabel} ${hintTextForPrompt}`.trim();
                if (hintLine)
                    lines.push(hintLine);
            }
            if (questionText)
                lines.push(questionText);
            tutorMessage = lines.join("\n").trim();
            if (!tutorMessage) {
                tutorMessage = questionText || retryLine;
            }
        }
        else {
            let tutorPrompt;
            try {
                tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText, {
                    retryMessage,
                    hintText: "",
                    hintLeadIn: "",
                    forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
                    revealAnswer: "",
                    learnerProfileSummary: learnerProfileSummary ?? undefined,
                    explanationText: "",
                    instructionLanguage: instructionLanguage ?? undefined,
                    supportLevel,
                    supportTextDirective: includeSupport ? "include" : "omit",
                    eventType,
                    includeSupport,
                    conceptTag: eventConceptTag,
                    pace,
                    explanationDepth,
                    attemptCount,
                    isFirstQuestion: currentIndex === 0,
                });
            }
            catch {
                tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText, {
                    retryMessage,
                    hintText: "",
                    hintLeadIn: "",
                    forcedAdvanceMessage,
                    revealAnswer: "",
                    learnerProfileSummary: learnerProfileSummary ?? undefined,
                    explanationText: intent === "FORCED_ADVANCE" ? (currentQuestion?.explanation ?? "") : "",
                    instructionLanguage: instructionLanguage ?? undefined,
                    supportLevel,
                    supportTextDirective: includeSupport ? "include" : "omit",
                    eventType,
                    includeSupport,
                    conceptTag: eventConceptTag,
                    pace,
                    explanationDepth,
                    attemptCount,
                    isFirstQuestion: currentIndex === 0,
                });
            }
            try {
                const response = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent, { language: session.language });
                tutorMessage = response.primaryText;
                if (!(0, tutorOutputGuard_1.validateJsonShape)(response)) {
                    tutorMessage = "";
                }
            }
            catch {
                tutorMessage = "I'm having trouble responding right now. please try again.";
            }
        }
        const retryMessageForGuard = retryMessage;
        if (!(0, tutorOutputGuard_1.validatePrimaryLanguage)(tutorMessage, session.language) ||
            !(0, tutorOutputGuard_1.isTutorMessageAcceptable)({
                intent,
                language: session.language,
                message: tutorMessage,
                questionText,
                retryMessage: retryMessageForGuard,
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
                retryMessage: retryMessageForGuard,
                hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
                hintLeadIn: hintLeadInWithFocus,
                forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
                revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
            });
        }
        if (intent !== "ENCOURAGE_RETRY") {
            tutorMessage = buildTransitionMessage(intent, questionText, transitionLanguage);
        }
        const completionDetected = /completed this (lesson|session)/i.test(tutorMessage);
        if (completionDetected && baseStatus !== "completed") {
            session.state = "COMPLETE";
            baseStatus = "completed";
            try {
                await progressState_1.LessonProgressModel.updateOne({ userId: session.userId, language: session.language, lessonId: session.lessonId }, {
                    $set: {
                        status: baseStatus,
                        currentQuestionIndex: session.currentQuestionIndex || 0,
                        lastActiveAt: new Date(),
                    },
                }, { upsert: true });
            }
            catch {
                // best-effort
            }
        }
        if (includeSupport) {
            const supportQuestion = intent === "ENCOURAGE_RETRY" || intent === "FORCED_ADVANCE" ? currentQuestion : nextQuestion;
            supportText = (0, supportSectionBuilder_1.buildSupportSection)({
                lessonLanguage: session.language,
                instructionLanguage: instructionLanguage ?? undefined,
                supportLanguageStyle: policy.supportLanguageStyle,
                maxSupportBullets: policy.maxSupportBullets,
                explanationDepth,
                eventType,
                conceptTag: eventConceptTag,
                hintTarget: typeof supportQuestion?.hintTarget === "string" ? supportQuestion.hintTarget : undefined,
                explanationTarget: typeof supportQuestion?.explanationTarget === "string"
                    ? supportQuestion.explanationTarget
                    : undefined,
                hintSupport: typeof supportQuestion?.hintSupport === "string" ? supportQuestion.hintSupport : undefined,
                explanationSupport: typeof supportQuestion?.explanationSupport === "string"
                    ? supportQuestion.explanationSupport
                    : undefined,
            });
        }
        else {
            supportText = "";
        }
        const combinedMessage = supportText ? `${tutorMessage}\n\n${supportText}` : tutorMessage;
        session.messages.push({ role: "assistant", content: combinedMessage });
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
                    sourceQuestionText: currentQuestion.prompt || currentQuestion.question,
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
        const question = buildQuestionMeta(nextQuestion);
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
            ...(question ? { question } : {}),
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
    const { language, lessonId } = req.query ?? {};
    if (!userId)
        return (0, sendError_1.sendError)(res, 400, "UserId is required", "INVALID_REQUEST");
    try {
        let normalizedLanguage = null;
        if (typeof language === "string" && language.trim()) {
            normalizedLanguage = (0, lessonHelpers_1.normalizeLanguage)(language);
            if (!normalizedLanguage) {
                return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
            }
        }
        const sessionQuery = { userId };
        if (normalizedLanguage)
            sessionQuery.language = normalizedLanguage;
        if (typeof lessonId === "string" && lessonId.trim()) {
            sessionQuery.lessonId = lessonId.trim();
        }
        const session = await sessionState_1.LessonSessionModel.findOne(sessionQuery, undefined, {
            sort: { updatedAt: -1 },
        });
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
        let storedTeachingPrefs = null;
        try {
            storedTeachingPrefs =
                typeof learnerProfileStore_1.getTeachingProfilePrefs === "function"
                    ? await (0, learnerProfileStore_1.getTeachingProfilePrefs)(session.userId, session.language)
                    : null;
        }
        catch {
            storedTeachingPrefs = null;
        }
        const resolvedTeachingPrefs = {
            pace: normalizeTeachingPace(storedTeachingPrefs?.pace),
            explanationDepth: normalizeExplanationDepthPref(storedTeachingPrefs?.explanationDepth),
            supportLevel: normalizeSupportLevelPref(storedTeachingPrefs?.supportLevel),
        };
        const tutorMessage = await ensureTutorPromptOnResume(session, instructionLanguage, resolvedTeachingPrefs);
        const lesson = (0, lessonLoader_1.loadLesson)(session.language, session.lessonId);
        const progress = lesson ? (0, lessonHelpers_1.buildProgressPayload)(session, lesson) : undefined;
        const question = lesson
            ? buildQuestionMeta(lesson.questions?.[session.currentQuestionIndex ?? 0])
            : null;
        return res.status(200).json({
            session,
            messages: session.messages,
            ...(tutorMessage ? { tutorMessage } : {}),
            ...(progress ? { progress } : {}),
            ...(question ? { question } : {}),
        });
    }
    catch (err) {
        (0, logger_1.logServerError)("getSessionHandler", err, res.locals?.requestId);
        return (0, sendError_1.sendError)(res, 500, "Failed to fetch session", "SERVER_ERROR");
    }
};
exports.getSessionHandler = getSessionHandler;
