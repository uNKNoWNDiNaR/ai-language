"use strict";
// backend/src/ai/tutorOutputGuard.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTutorMessageAcceptable = isTutorMessageAcceptable;
exports.validatePrimaryLanguage = validatePrimaryLanguage;
exports.validateSupportLanguage = validateSupportLanguage;
exports.validateSupportLength = validateSupportLength;
exports.validateJsonShape = validateJsonShape;
exports.buildTutorFallback = buildTutorFallback;
const calmToneGuard_1 = require("./calmToneGuard");
const continuityPrivacyGuard_1 = require("./continuityPrivacyGuard");
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function norm(s) {
    return String(s || "").trim();
}
function contains(haystack, needle) {
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    return n.length > 0 && h.includes(n);
}
function buildAllowedContext(i) {
    // We intentionally do NOT require hints/answers to appear in the tutor message anymore.
    // Only keep minimal allowed context for drift checks.
    return [i.questionText, i.retryMessage, i.forcedAdvanceMessage]
        .map((x) => norm(String(x || "")))
        .filter(Boolean)
        .join("\n");
}
function hasLanguageDrift(message, language, context) {
    const msg = norm(message);
    if (!msg)
        return true;
    const ctx = norm(context || "");
    const forbiddenByLang = {
        en: [/german/i, /deutsch/i, /french/i, /fran[çc]ais/i, /spanish/i, /espa[ñn]ol/i],
        de: [/english/i, /french/i, /fran[çc]ais/i, /spanish/i, /espa[ñn]ol/i],
        fr: [/english/i, /german/i, /deutsch/i, /spanish/i, /espa[ñn]ol/i],
        es: [/english/i, /german/i, /deutsch/i, /french/i, /fran[çc]ais/i],
    };
    const forbidden = forbiddenByLang[language] || [];
    for (const re of forbidden) {
        if (re.test(msg) && !re.test(ctx))
            return true;
    }
    return false;
}
function isTutorMessageAcceptable(i) {
    const msg = norm(i.message);
    if (!msg)
        return false;
    if (msg.length > 1200)
        return false;
    if (hasLanguageDrift(msg, i.language, buildAllowedContext(i)))
        return false;
    if ((0, calmToneGuard_1.violatesCalmTone)(msg))
        return false;
    if ((0, continuityPrivacyGuard_1.violatesContinuityPrivacy)(msg))
        return false;
    if (i.intent === "ASK_QUESTION") {
        if (i.language === "en") {
            return contains(msg, "let's begin") && contains(msg, i.questionText);
        }
        return contains(msg, i.questionText);
    }
    if (i.intent === "ADVANCE_LESSON") {
        if (i.language === "en") {
            return contains(msg, "next question") && contains(msg, i.questionText);
        }
        return contains(msg, i.questionText);
    }
    if (i.intent === "ENCOURAGE_RETRY") {
        const retry = norm(i.retryMessage || "");
        if (i.language === "en" && retry && !contains(msg, retry))
            return false;
        return contains(msg, i.questionText);
    }
    if (i.intent === "FORCED_ADVANCE") {
        const forced = norm(i.forcedAdvanceMessage || "");
        if (i.language === "en" && forced && !contains(msg, forced))
            return false;
        const q = norm(i.questionText);
        if (q && !contains(msg, q))
            return false;
        return true;
    }
    return /completed this lesson/i.test(msg) || /great job/i.test(msg);
}
function validatePrimaryLanguage(text, targetLanguage) {
    const msg = norm(text);
    if (!msg)
        return false;
    return !hasLanguageDrift(msg, targetLanguage);
}
function validateSupportLanguage(text, instructionLanguage) {
    const msg = norm(text);
    if (!msg)
        return true;
    return !hasLanguageDrift(msg, instructionLanguage);
}
function validateSupportLength(text, supportLevel) {
    const msg = norm(text);
    if (!msg)
        return true;
    const levelOrCap = Number.isFinite(supportLevel) ? supportLevel : 0.85;
    const cap = levelOrCap > 1
        ? Math.floor(levelOrCap)
        : levelOrCap >= 0.75
            ? 280
            : levelOrCap >= 0.4
                ? 200
                : 120;
    return msg.length <= cap;
}
function validateJsonShape(value) {
    if (!isRecord(value))
        return false;
    return typeof value.primaryText === "string" && typeof value.supportText === "string";
}
function buildTutorFallback(i) {
    const questionText = norm(i.questionText);
    const isEnglish = i.language === "en";
    if (i.intent === "ASK_QUESTION") {
        return isEnglish ? `Let's begin.\n${questionText}` : questionText;
    }
    if (i.intent === "ADVANCE_LESSON") {
        return isEnglish ? `Nice work! Next question:\n"${questionText}"` : questionText;
    }
    if (i.intent === "ENCOURAGE_RETRY") {
        const retryMessage = norm(i.retryMessage || "");
        if (isEnglish) {
            return [retryMessage || "Not quite — try again.", questionText].filter(Boolean).join("\n");
        }
        return questionText || "...";
    }
    if (i.intent === "FORCED_ADVANCE") {
        const forcedAdvanceMessage = norm(i.forcedAdvanceMessage || "");
        if (!questionText)
            return forcedAdvanceMessage || "That one was tricky — let's continue.";
        if (isEnglish) {
            return [
                forcedAdvanceMessage || "That one was tricky — let's continue.",
                `Next question:\n"${questionText}"`,
            ]
                .filter(Boolean)
                .join("\n");
        }
        return questionText || "...";
    }
    return isEnglish ? "Great job! 🎉 You've completed this lesson." : "...";
}
