"use strict";
// backend/src/content/helpResolver.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHelp = resolveHelp;
const index_1 = require("./instructionPacks/index");
function clampSupportLevel(value) {
    if (!Number.isFinite(value))
        return 0.85;
    return Math.max(0, Math.min(1, value));
}
function normalizeConceptTag(question) {
    if (question && typeof question.helpKey === "string" && question.helpKey.trim()) {
        return question.helpKey.trim();
    }
    if (question && typeof question.conceptTag === "string") {
        return question.conceptTag.trim();
    }
    return "";
}
function getLegacyHints(question) {
    const hintsArr = Array.isArray(question?.hints) ? question.hints : [];
    const legacyHint = typeof question?.hint === "string" ? question.hint : "";
    return [hintsArr[0] || legacyHint, hintsArr[1] || hintsArr[0] || legacyHint]
        .map((h) => (typeof h === "string" ? h.trim() : ""))
        .filter(Boolean);
}
function getInstructionFallback(lang) {
    switch (lang) {
        case "de":
            return {
                hint: "Versuche die erwartete Struktur.",
                explanation: "Schau dir die erwartete Struktur an und versuche es noch einmal.",
            };
        case "es":
            return {
                hint: "Intenta la estructura esperada.",
                explanation: "Revisa la estructura esperada y vuelve a intentarlo.",
            };
        case "fr":
            return {
                hint: "Essaie la structure attendue.",
                explanation: "Revois la structure attendue et réessaie.",
            };
        default:
            return {
                hint: "Try the expected structure.",
                explanation: "Review the expected structure and try again.",
            };
    }
}
function getTargetFallback(lang) {
    if (lang !== "en") {
        return { hint: "", explanation: "" };
    }
    return {
        hint: "Try the expected structure.",
        explanation: "Review the expected structure and try again.",
    };
}
function resolveHelp(question, attemptCount, targetLanguage, instructionLanguage, supportLevel, recentConfusion, includeSupportOverride) {
    const level = clampSupportLevel(supportLevel);
    const conceptTag = normalizeConceptTag(question);
    const pack = conceptTag ? (0, index_1.getHelpText)(conceptTag, instructionLanguage) : {};
    const hintEvent = attemptCount >= 2;
    const forcedAdvance = attemptCount >= 4;
    let includeSupport = false;
    if (level >= 0.75) {
        includeSupport = hintEvent || forcedAdvance;
    }
    else if (level >= 0.4) {
        includeSupport = hintEvent || forcedAdvance;
    }
    else {
        includeSupport = forcedAdvance || (hintEvent && recentConfusion);
    }
    if (typeof includeSupportOverride === "boolean") {
        includeSupport = includeSupportOverride;
    }
    const legacyHints = getLegacyHints(question);
    const hintTarget = typeof question?.hintTarget === "string" ? question.hintTarget.trim() : "";
    const hintSupport = typeof question?.hintSupport === "string" ? question.hintSupport.trim() : "";
    const explanationTarget = typeof question?.explanationTarget === "string" ? question.explanationTarget.trim() : "";
    const explanationSupport = typeof question?.explanationSupport === "string" ? question.explanationSupport.trim() : "";
    const targetFallback = getTargetFallback(targetLanguage);
    const supportFallback = getInstructionFallback(instructionLanguage);
    const supportHint1 = hintSupport || (pack.hint1 || "").trim();
    const supportHint2 = hintSupport || (pack.hint2 || pack.hint1 || "").trim();
    const targetHint1 = hintTarget || legacyHints[0] || targetFallback.hint;
    const targetHint2 = hintTarget || legacyHints[1] || legacyHints[0] || targetFallback.hint;
    let hintText = "";
    if (attemptCount === 2) {
        hintText = includeSupport ? supportHint1 : targetHint1;
    }
    else if (attemptCount === 3) {
        hintText = includeSupport ? supportHint2 : targetHint2;
    }
    if (includeSupport && !hintText) {
        hintText = supportFallback.hint;
    }
    let explanationText = "";
    if (forcedAdvance) {
        const supportExplanation = explanationSupport || (pack.explanation || "").trim();
        const targetExplanation = explanationTarget ||
            (typeof question?.explanation === "string" ? question.explanation.trim() : "");
        if (includeSupport) {
            explanationText = supportExplanation || supportFallback.explanation;
        }
        else {
            explanationText = targetExplanation || targetFallback.explanation;
        }
    }
    return {
        hintText: hintText || undefined,
        explanationText: explanationText || undefined,
        includeSupport,
    };
}
