"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSupportPolicy = computeSupportPolicy;
function isQuestionIntent(intent) {
    return (intent === "ASK_QUESTION" ||
        intent === "ADVANCE_LESSON" ||
        intent === "ENCOURAGE_RETRY" ||
        intent === "FORCED_ADVANCE");
}
function computeSupportPolicy(input) {
    const pace = input.pace === "slow" ? "slow" : "normal";
    const supportLevel = input.supportLevel ?? "high";
    const attemptCount = typeof input.attemptCount === "number" ? input.attemptCount : 1;
    const hasIL = Boolean(input.instructionLanguage) && input.instructionLanguage !== input.lessonLanguage;
    if (supportLevel === "high") {
        const includeSupport = isQuestionIntent(input.intent);
        return {
            supportMode: "A",
            includeSupport,
            supportLanguageStyle: hasIL ? "il_only" : "tl_only",
            maxSupportBullets: 1,
        };
    }
    const includeSupport = (() => {
        if (input.intent === "FORCED_ADVANCE")
            return true;
        if (input.intent === "ASK_QUESTION" || input.intent === "ADVANCE_LESSON") {
            return false;
        }
        if (input.intent === "ENCOURAGE_RETRY") {
            return supportLevel === "medium" ? attemptCount >= 2 : attemptCount >= 3;
        }
        return false;
    })();
    return {
        supportMode: "B",
        includeSupport,
        supportLanguageStyle: supportLevel === "medium" && hasIL ? "mixed" : "tl_only",
        maxSupportBullets: 1,
    };
}
