"use strict";
// src/ai/staticTutorMessages.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEndLessonMessage = getEndLessonMessage;
exports.getForcedAdvanceMessage = getForcedAdvanceMessage;
exports.getDeterministicRetryMessage = getDeterministicRetryMessage;
function getEndLessonMessage() {
    return "Great job! 🎉 You've completed this session.";
}
function getForcedAdvanceMessage() {
    return "That one was tricky - here's the correct. then we'll continue.";
}
function getDeterministicRetryMessage(args) {
    const { reasonCode, attemptCount, repeatedSameWrong } = args;
    // If user repeats the same wrong answer, change strategy (still deterministic).
    if (repeatedSameWrong) {
        return "Let's try a different approach — focus on the structure.";
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
        default:
            return attemptCount >= 3 ? "Not quite — try again using the expected structure." : "Not quite — try again.";
    }
}
