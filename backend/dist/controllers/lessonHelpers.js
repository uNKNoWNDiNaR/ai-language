"use strict";
//backend/src/controllers/lessonHelpers.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupportedLanguage = isSupportedLanguage;
exports.normalizeLanguage = normalizeLanguage;
exports.getTutorIntent = getTutorIntent;
exports.chooseHintForAttempt = chooseHintForAttempt;
exports.buildProgressPayload = buildProgressPayload;
function isSupportedLanguage(v) {
    return v === "en";
}
function normalizeLanguage(v) {
    if (typeof v !== "string")
        return null;
    const t = v.trim().toLowerCase();
    return isSupportedLanguage(t) ? t : null;
}
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
    if (attemptCount === 2) {
        const text = (hintsArr[0] || legacyHint || "").trim();
        if (!text)
            return undefined;
        return { level: 1, text };
    }
    // Attempt 3 -> stronger hint
    if (attemptCount === 3) {
        const text = (hintsArr[1] || hintsArr[0] || legacyHint || "").trim();
        if (!text)
            return undefined;
        return { level: 2, text };
    }
    // Attempt 4+ -> reveal explanation + answer (Explanation first)
    const rawExplanation = typeof question.explanation === "string" ? question.explanation.trim() : "";
    const explanation = rawExplanation || "This is the expected structure for this question.";
    const rawAnswer = typeof question.answer === "string" ? question.answer.trim() : String(question.answer ?? "").trim();
    const answer = rawAnswer || "—";
    const reveal = `Explanation: ${explanation}\nAnswer: ${answer}`;
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
