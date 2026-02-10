"use strict";
//backend/src/controllers/practiceSubmitController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitPractice = void 0;
const sessionStore_1 = require("../storage/sessionStore");
const answerEvaluator_1 = require("../state/answerEvaluator");
const practiceTutorEplainer_1 = require("../ai/practiceTutorEplainer");
const learnerProfileStore_1 = require("../storage/learnerProfileStore");
const mapLike_1 = require("../utils/mapLike");
const sendError_1 = require("../http/sendError");
const featureFlags_1 = require("../config/featureFlags");
const supportPolicy_1 = require("../services/supportPolicy");
function parseQuestionIdFromConceptTag(tag) {
    if (typeof tag !== "string")
        return null;
    const m = tag.match(/\bq(\d+)\b/i);
    return m ? String(Number(m[1])) : null;
}
function getHintForAttempt(item, attemptCount) {
    // attemptCount is 1-based
    if (attemptCount <= 1)
        return null;
    const hints = Array.isArray(item.hints)
        ? item.hints.map((h) => (typeof h === "string" ? h.trim() : "")).filter(Boolean)
        : [];
    const hint = typeof item.hint === "string" ? item.hint.trim() : "";
    if (attemptCount === 2)
        return hints[0] || hint || null;
    if (attemptCount === 3)
        return hints[1] || hints[0] || hint || null;
    // Attempt 4+
    return `Answer: ${item.expectedAnswerRaw}`;
}
function buildTutorMessage(result, hint) {
    if (result === "correct")
        return "Nice — that’s correct.";
    if (result === "almost")
        return hint ? `Almost. ${hint}` : "Almost. Try again.";
    return hint ? `Not quite. ${hint}` : "Not quite. Try again.";
}
function stripDebugPrefixes(text) {
    if (!text)
        return text;
    // Strip common internal/debug label prefixes (colon, dash, arrow variants)
    const prefix = /^(\s*(Result|Reason|Expected\s*Answer|Expected|User\s*Answer|Your\s*Answer)\s*[:\-–—>]+\s*)/i;
    const cleaned = text
        .split(/\r?\n/)
        .map((line) => {
        const l = line.trimEnd();
        if (!l.trim())
            return "";
        const without = l.replace(prefix, "").trim();
        return without;
    })
        .filter((l) => l.length > 0)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return cleaned;
}
function looksInternal(text) {
    if (!text)
        return true;
    const labelLeak = /(^|\n)\s*(result|reason|expected(\s*answer)?|user\s*answer|your\s*answer)\s*[:\-–—>]/i;
    if (labelLeak.test(text))
        return true;
    // Too-short outputs are usually not user-facing (e.g. "almost")
    if (text.trim().length < 8)
        return true;
    return false;
}
const submitPractice = async (req, res) => {
    const { userId, practiceId, answer } = req.body ?? {};
    if (typeof userId !== "string" || userId.trim() === "") {
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    }
    if (typeof practiceId !== "string" || practiceId.trim() === "") {
        return (0, sendError_1.sendError)(res, 400, "practiceId is required", "INVALID_REQUEST");
    }
    if (typeof answer !== "string" || answer.trim() === "") {
        return (0, sendError_1.sendError)(res, 400, "answer is required", "INVALID_REQUEST");
    }
    const session = await (0, sessionStore_1.getSession)(userId);
    if (!session) {
        return (0, sendError_1.sendError)(res, 404, "Session not found", "NOT_FOUND");
    }
    const practiceById = session.practiceById ?? new Map();
    const item = (0, mapLike_1.mapLikeGet)(practiceById, practiceId);
    if (!item) {
        return (0, sendError_1.sendError)(res, 404, "Practice item not found", "NOT_FOUND");
    }
    let practiceAttempts = session.practiceAttempts ?? new Map();
    const prev = (0, mapLike_1.mapLikeGetNumber)(practiceAttempts, practiceId, 0);
    const attemptCount = prev + 1;
    practiceAttempts = (0, mapLike_1.mapLikeSet)(practiceAttempts, practiceId, attemptCount);
    session.practiceAttempts = practiceAttempts;
    // Adapt PracticeItem -> LessonQuestion for your existing evaluator
    const q = {
        id: 0,
        question: item.prompt,
        prompt: item.prompt,
        answer: item.expectedAnswerRaw,
        hint: typeof item.hint === "string" ? item.hint : undefined,
        examples: item.examples,
    };
    const evalRes = (0, answerEvaluator_1.evaluateAnswer)(q, answer, item.language);
    const hint = getHintForAttempt(item, attemptCount);
    const baseMessage = buildTutorMessage(evalRes.result, hint);
    let explanation = null;
    let instructionLanguage = null;
    let includeSupport = false;
    let supportLevel = 0.85;
    if ((0, featureFlags_1.isInstructionLanguageEnabled)()) {
        try {
            const lang = (typeof session.language === "string" && session.language.trim()
                ? session.language
                : item.language) || item.language;
            instructionLanguage = await (0, learnerProfileStore_1.getInstructionLanguage)(session.userId, lang);
        }
        catch {
            instructionLanguage = null;
        }
    }
    if (instructionLanguage) {
        const eventType = evalRes.result === "correct"
            ? "CORRECT_FEEDBACK"
            : evalRes.result === "almost"
                ? "ALMOST_FEEDBACK"
                : "WRONG_FEEDBACK";
        try {
            const supportProfile = await (0, learnerProfileStore_1.getSupportProfile)(session.userId, item.language);
            supportLevel = (0, supportPolicy_1.clampSupportLevel)(supportProfile.supportLevel);
        }
        catch {
            supportLevel = 0.85;
        }
        includeSupport = (0, supportPolicy_1.shouldIncludeSupportPolicy)({
            eventType,
            supportLevel,
            questionIndex: 0,
            repeatedConfusion: false,
            explicitRequest: false,
            forceNoSupport: Boolean(session.forceNoSupport),
        });
    }
    // Only add an explanation when it helps learning without overpacking:
    // - correct: short "why it works"
    // - almost/wrong: only after attempt 2/3 (attempt 1 stays "try again"; attempt 4+ reveals answer)
    const shouldExplain = evalRes.result === "correct" ||
        ((evalRes.result === "almost" || evalRes.result === "wrong") &&
            attemptCount >= 2 &&
            attemptCount <= 3);
    if (shouldExplain && (!instructionLanguage || includeSupport)) {
        try {
            explanation = await (0, practiceTutorEplainer_1.explainPracticeResult)({
                language: item.language,
                instructionLanguage: instructionLanguage ?? undefined,
                result: evalRes.result,
                reasonCode: evalRes.reasonCode,
                expectedAnswer: item.expectedAnswerRaw,
                userAnswer: answer,
                hint,
                attemptCount,
            });
        }
        catch {
            explanation = null;
        }
    }
    const rawLabelLeak = /(^|\n)\s*(result|reason|expected(\s*answer)?|user\s*answer|your\s*answer)\s*[:\-–—>]/i;
    // If the explainer output looks like internal/debug formatting, reject it entirely.
    // (Do NOT try to "strip" and salvage it.)
    const explainerText = explanation && !rawLabelLeak.test(explanation) ? explanation : null;
    const cleanedExplanation = explainerText ? stripDebugPrefixes(explainerText) : "";
    const safeExplanation = cleanedExplanation && !looksInternal(cleanedExplanation) ? cleanedExplanation : "";
    // Keep the deterministic base (with hint escalation), and add a short user-facing explanation if available.
    const tutorMessage = safeExplanation ? `${baseMessage} ${safeExplanation}`.trim() : baseMessage;
    // ---- Learner profile tracking (BITE 4.1, best-effort; no behavior change) ----
    try {
        await (0, learnerProfileStore_1.recordPracticeAttempt)({
            userId: session.userId,
            language: session.language,
            result: evalRes.result,
            reasonCode: evalRes.reasonCode,
            conceptTag: item?.meta?.conceptTag,
        });
    }
    catch {
        // best-effort: never break practice flow
    }
    const reviewRef = item?.meta?.reviewRef;
    if (reviewRef?.lessonId && reviewRef?.questionId) {
        try {
            if (typeof learnerProfileStore_1.recordReviewPracticeOutcome === "function") {
                await (0, learnerProfileStore_1.recordReviewPracticeOutcome)({
                    userId: session.userId,
                    language: session.language,
                    lessonId: reviewRef.lessonId,
                    questionId: reviewRef.questionId,
                    result: evalRes.result,
                    conceptTag: item?.meta?.conceptTag,
                });
            }
        }
        catch {
            // best-effort: never break practice flow
        }
    }
    if (evalRes.result === "correct") {
        // 1) Clear cooldown for the source question (so future "almost" can generate again)
        const qid = parseQuestionIdFromConceptTag(item?.meta?.conceptTag);
        if (qid) {
            const cd = session.practiceCooldownByQuestionId ?? new Map();
            if (typeof cd.set === "function")
                cd.set(qid, 0);
            else
                cd[qid] = 0;
            session.practiceCooldownByQuestionId = cd;
        }
        // 2) Consume practice item (remove it + its attempts counter)
        if (typeof practiceById.delete === "function")
            practiceById.delete(practiceId);
        else
            delete practiceById[practiceId];
        if (typeof practiceAttempts.delete === "function")
            practiceAttempts.delete(practiceId);
        else
            delete practiceAttempts[practiceId];
        session.practiceById = practiceById;
        session.practiceAttempts = practiceAttempts;
    }
    await (0, sessionStore_1.updateSession)(session);
    return res.status(200).json({
        result: evalRes.result,
        reasonCode: evalRes.reasonCode,
        attemptCount,
        tutorMessage,
    });
};
exports.submitPractice = submitPractice;
