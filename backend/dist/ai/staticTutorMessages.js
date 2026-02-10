"use strict";
// src/ai/staticTutorMessages.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFocusNudge = getFocusNudge;
exports.getEndLessonMessage = getEndLessonMessage;
exports.getForcedAdvanceMessage = getForcedAdvanceMessage;
exports.getDeterministicRetryMessage = getDeterministicRetryMessage;
exports.getHintLeadIn = getHintLeadIn;
exports.getDeterministicRetryExplanation = getDeterministicRetryExplanation;
function getFocusNudge(reasonCode) {
    const c = String(reasonCode || "").trim().toUpperCase();
    if (!c)
        return "";
    switch (c) {
        case "WORD_ORDER":
            return "Let's focus on word order.";
        case "ARTICLE":
            return "Let's pay attention to the article.";
        case "TYPO":
            return "Let's double-check spelling.";
        case "WRONG_LANGUAGE":
            return "Let's answer in the selected language.";
        case "MISSING_SLOT":
            return "Let's make sure nothing is missing.";
        default:
            return "";
    }
}
function getEndLessonMessage() {
    return "Great job! 🎉 You've completed this session.";
}
function getForcedAdvanceMessage() {
    return "That one was tricky - I'll show the correct answer below, then we'll continue.";
}
function getDeterministicRetryMessage(args) {
    const { reasonCode, attemptCount, repeatedSameWrong } = args;
    // If user repeats the same wrong answer, change strategy (still deterministic).
    if (repeatedSameWrong) {
        if (attemptCount <= 2) {
            return "You gave the same answer again - try changing one part of it.";
        }
        if (attemptCount === 3) {
            return "Same answer again - use the hint and adjust your wording.";
        }
        return "Let's move on - this one needs a different review.";
    }
    switch (reasonCode) {
        case "TYPO":
            return attemptCount >= 3 ? "Close — check spelling carefully." : "Close — check spelling.";
        case "ARTICLE":
            return attemptCount >= 3 ? "Almost — watch the article and noun." : "Watch the article.";
        case "WORD_ORDER":
            return attemptCount >= 3 ? "Almost — check word order and structure." : "Check word order.";
        case "WRONG_LANGUAGE":
            return "Answer in the selected language.";
        case "MISSING_SLOT":
            return "Almost - You're missing the name part.";
        default:
            return "Not quite — try again.";
    }
}
function getHintLeadIn(attemptCount) {
    if (attemptCount === 3)
        return "This hint should make it clearer.";
    if (attemptCount <= 2)
        return "Here's a small hint to help you.";
    return "Here's the answer.";
}
// Deterministic micro-explanations (privacy-safe, token-bounded).
function getDeterministicRetryExplanation(args) {
    const { reasonCode, attemptCount, depth } = args;
    if (depth === "short")
        return "";
    if (depth === "normal" && attemptCount < 3)
        return "";
    if (depth === "detailed" && attemptCount < 2)
        return "";
    const c = typeof reasonCode === "string" ? reasonCode.trim().toUpperCase() : "";
    switch (c) {
        case "ARTICLE":
            return "Pay attention to the article that belongs with the noun (like the/a).";
        case "WORD_ORDER":
            return "Try keeping the same word order as the example or expected structure.";
        case "WRONG_LANGUAGE":
            return "Answer in the selected lesson language.";
        case "MISSING_SLOT":
            return "Make sure you include the missing part the question expects.";
        case "TYPO":
            return "Small spelling differences can make the answer wrong — check carefully.";
        default:
            return "Try matching the expected structure closely.";
    }
}
