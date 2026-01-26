"use strict";
//backend/src/ai/practiceTutorExplainer.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainPracticeResult = explainPracticeResult;
const openaiClient_1 = require("./openaiClient");
function sanitizeExplanation(text) {
    const t = text.trim();
    if (!t)
        return null;
    // Hard length guard (keeps outputs short even if model drifts)
    if (t.length > 260)
        return null;
    // No grading / rubric contamination
    const banned = /(acceptable answers|correct answer|incorrect|grading|rubric|score|points|marking scheme)/i;
    if (banned.test(t))
        return null;
    return t;
}
async function explainPracticeResult(p) {
    try {
        const systemPrompt = `
You are a calm, patient, native-speaker language tutor.
You NEVER decide if an answer is correct - that is already decided
Your job:
- If correct: briefly explain why it works.
- If almost: explain what is slightly off.
- If wrong: explain the mistake and how to fix it.

Rules:
- Be short (1-2 sentences).
- Be encouraging.
- No grading language.
- No questions.
- Use the learner's language: ${p.language}.`
            .trim();
        const userPrompt = `
Expected answer: "${p.expectedAnswer}"
User answer: "${p.userAnswer}"
Result: "${p.result}"
Reason: ${p.reasonCode ?? "none"}`
            .trim();
        const prompt = `${systemPrompt}\n\n${userPrompt}`;
        const intent = "EXPLAIN_PRACTICE_RESULT";
        const reply = await (0, openaiClient_1.generateTutorResponse)(prompt, intent, {
            temperature: 0.3,
            maxOutputTokens: 120
        });
        return typeof reply === "string" ? sanitizeExplanation(reply) : null;
    }
    catch {
        return null;
    }
}
