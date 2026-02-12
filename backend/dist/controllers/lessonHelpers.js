"use strict";
//backend/src/controllers/lessonHelpers.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupportedLanguage = isSupportedLanguage;
exports.normalizeLanguage = normalizeLanguage;
exports.getTutorIntent = getTutorIntent;
exports.chooseHintForAttempt = chooseHintForAttempt;
exports.buildProgressPayload = buildProgressPayload;
const index_1 = require("../content/instructionPacks/index");
const helpResolver_1 = require("../content/helpResolver");
function isSupportedLanguage(v) {
    return v === "en" || v === "de" || v === "es" || v === "fr";
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
function resolveConceptTag(question) {
    if (question && typeof question.helpKey === "string" && question.helpKey.trim()) {
        return question.helpKey.trim();
    }
    if (question && typeof question.conceptTag === "string") {
        return question.conceptTag.trim();
    }
    return "";
}
function chooseHintForAttempt(question, attemptCount, opts) {
    // Attempt 1 -> no hint
    if (attemptCount <= 1)
        return undefined;
    const conceptTag = resolveConceptTag(question);
    const instructionLanguage = opts?.instructionLanguage ?? undefined;
    const targetLanguage = opts?.targetLanguage ?? "en";
    const supportLevel = typeof opts?.supportLevel === "number" ? opts.supportLevel : 0.85;
    const recentConfusion = Boolean(opts?.recentConfusion);
    const help = (0, helpResolver_1.resolveHelp)(question, attemptCount, targetLanguage, (instructionLanguage ?? targetLanguage), supportLevel, recentConfusion, opts?.includeSupport);
    const pack = conceptTag ? (0, index_1.getHelpText)(conceptTag, instructionLanguage ?? undefined) : {};
    // Support BOTH formats:
    // - hint?: string (legacy)
    // - hints?: string[] (new)
    const hintsArr = Array.isArray(question.hints) ? question.hints : [];
    const legacyHint = typeof question.hint === "string" ? question.hint : "";
    const hintTarget = typeof question.hintTarget === "string" ? question.hintTarget.trim() : "";
    const explanationTarget = typeof question.explanationTarget === "string" ? question.explanationTarget.trim() : "";
    const hintLegacy = typeof question.hint === "string" ? question.hint.trim() : "";
    const hintList = Array.isArray(question.hints)
        ? question.hints.map((h) => (typeof h === "string" ? h.trim() : "")).filter(Boolean)
        : [];
    const resolvedHint = (help.hintText || "").trim();
    const hintFromQuestion1 = (hintsArr[0] || hintTarget || legacyHint || "").trim();
    const hintFromQuestion2 = (hintsArr[1] || hintsArr[0] || hintTarget || legacyHint || "").trim();
    const hint1 = (hintFromQuestion1 || resolvedHint || pack.hint1 || "").trim();
    const hint2 = (hintFromQuestion2 || resolvedHint || pack.hint2 || pack.hint1 || "").trim();
    // Attempt 2 -> light hint
    if (attemptCount === 2) {
        const text = hint1;
        if (!text)
            return undefined;
        return { level: 1, text };
    }
    // Attempt 3 -> stronger hint
    if (attemptCount === 3) {
        const text = hint2;
        if (!text)
            return undefined;
        return { level: 2, text };
    }
    // Attempt 4+ -> reveal explanation + answer (Explanation first)
    const rawExplanation = (explanationTarget && explanationTarget.trim()) ||
        (typeof question.explanation === "string" ? question.explanation.trim() : "") ||
        (help.explanationText && help.explanationText.trim()) ||
        (pack.explanation && pack.explanation.trim()) ||
        "";
    const explanation = rawExplanation ||
        explanationTarget ||
        hintTarget ||
        hintLegacy ||
        hintList[0] ||
        "This is the expected structure for this question.";
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
