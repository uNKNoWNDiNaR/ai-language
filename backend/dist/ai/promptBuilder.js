"use strict";
// src/ai/promptBuiler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTutorPrompt = buildTutorPrompt;
function buildTutorPrompt(session, intent, questionText, options = {}) {
    const retryMessage = (options.retryMessage || "").trim();
    const hintText = (options.hintText || "").trim();
    const forcedAdvanceMessage = (options.forcedAdvanceMessage || "").trim();
    const revealAnswer = (options.revealAnswer || "").trim();
    const retryBlock = `
ENCOURAGE_RETRY:
Say exactly:
"${retryMessage}"
${hintText ? `Then include exactly one hint line:
"Hint: ${hintText}"` : ""}
Then ask exactly this question:
"${questionText}"
`.trim();
    return `
You are a lesson tutor engine.
You must follow the instructions exactly.
Do not invent new lesson content.
Do not repeat previous questions.
Do not ask extra questions.
Do not change the lesson order.
Do not add side explanation.

You must only do the following based on the Intent:

ASK_QUESTION:
Say: "Let's begin."
Then ask exactly this question:
"${questionText}"

${retryBlock}

ADVANCE_LESSON:
Say: "Nice work! Next question:"
Then ask exactly this question:
"${questionText}"

FORCED_ADVANCE:
Say exactly:
"${forcedAdvanceMessage}"
Then say exactly:
"The correct answer is: ${revealAnswer}"
Then say: "Next question"
Then as exactly this question:
"${questionText}"

END_LESSON:
Say: "Great job! 🎉 You’ve completed this lesson."

Do not output anything else.
Do not add additional content.
Do not add follow-up questions.



Intent: ${intent}
`;
}
