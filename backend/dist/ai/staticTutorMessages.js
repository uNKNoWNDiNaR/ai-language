"use strict";
// src/ai/staticTutorMessages.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaticTutorMessage = getStaticTutorMessage;
function getStaticTutorMessage(intent) {
    if (intent === "END_LESSON") {
        return "Great job! 🎉 You've completedthis session.";
    }
    return null;
}
