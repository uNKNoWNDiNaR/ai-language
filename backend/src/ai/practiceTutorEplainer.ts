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
    hint?: string | null;
    attemptCount?: number;
};

function sanitizeExplanation(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  // Keep explanations short so adding them doesn't overpack the UI
  if (t.length > 220) return null;

  // Reject rubric/grading artifacts (but allow normal words like "correct")
  const banned =
    /(acceptable answers|grading|rubric|score|points|marking scheme)/i;
  if (banned.test(t)) return null;

  // Never leak internal/debug-ish labels to the UI
  const labelLeak =
    /(^|\n)\s*(result|reason|expected(\s*answer)?|user\s*answer|your\s*answer)\s*[:\-–—>]/i;
  if (labelLeak.test(t)) return null;

  const fallbackish =
    /(I'm haviing trouble responding right now | sorry,\s*i couldn't generate a response)/i;
  if (fallbackish.test(t)) return null;

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
- Do not include labels like "Result:", "Reason:", "Expected answer:", or "User answer:".
- Never combine single encouraging sentenceslike Almost.Try again. Geat effort!. in one explnation.Only choose one relevant one 
- If a hint is provided, use it as guidance for what to focus on.
- Use the learner's language: ${p.language}.`
.trim();


const userPrompt = `
Target phrase (for you): "${p.expectedAnswer}"
Learner wrote: "${p.userAnswer}"
Outcome (already decided): "${p.result}"
${p.hint ? `Hint to focus on (for you): "${p.hint}"` : ""}`
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