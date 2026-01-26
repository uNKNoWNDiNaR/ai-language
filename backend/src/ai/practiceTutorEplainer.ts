//backend/src/ai/practiceTutorExplainer.ts


import { generateTutorResponse } from "./openaiClient";
import type { TutorIntent } from "./tutorIntent";
import type { EvalResult,ReasonCode } from "../state/answerEvaluator";


type ExplainParams = {
    language: string;
    result: EvalResult;
    reasonCode?: ReasonCode;
    expectedAnswer: string;
    userAnswer: string;
};

function sanitizeExplanation(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  // Hard length guard (keeps outputs short even if model drifts)
  if (t.length > 260) return null;

  // No grading / rubric contamination
  const banned = 
    /(acceptable answers|correct answer|incorrect|grading|rubric|score|points|marking scheme)/i;
  if (banned.test(t)) return null;

  return t;
}


export async function explainPracticeResult(p: ExplainParams): Promise<string | null> {
    try{
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
        const intent: TutorIntent = "EXPLAIN_PRACTICE_RESULT";

        const reply = await generateTutorResponse(prompt, intent, {
            temperature: 0.3,
            maxOutputTokens: 120
        });
        return typeof reply === "string" ? sanitizeExplanation(reply) : null;
    } catch {
        return null;
    }
}