// backend/src/ai/promptBuilder.ts

import { LessonSession } from "../state/lessonState";
import { TutorIntent } from "./tutorIntent";

type PromptOptions = {
  retryMessage?: string; // deterministic, provided by backend
  hintText?: string; // chosen from lesson hints/hint or reveal
  forcedAdvanceMessage?: string;
  revealAnswer?: string;
  hintLeadIn?: string;

  learnerProfileSummary?: string | null; 

  explanationText?: string;
};

function normalizeLang(v: unknown): "en" | "de" | "es" | "fr" | "unknown" {
  const s = String(v || "").trim().toLowerCase();
  if (s === "en" || s === "de" || s === "es" || s === "fr") return s;
  return "unknown";
}

export function buildTutorPrompt(
  session: LessonSession,
  intent: TutorIntent,
  questionText: string,
  options: PromptOptions = {}
): string {
  const retryMessage = (options.retryMessage || "").trim();
  const hintText = (options.hintText || "").trim();
  const forcedAdvanceMessage = (options.forcedAdvanceMessage || "").trim();
  const revealAnswer = (options.revealAnswer || "").trim();

  const explanationTextRaw = (options.explanationText || "").trim();
  const explanationText =
    explanationTextRaw.length > 360 ? explanationTextRaw.slice(0, 360).trim() : explanationTextRaw;

  const hintLeadIn = (options.hintLeadIn || "").trim();
  const lessonLang = normalizeLang((session as any)?.language);
  const learnerProfileSummaryRaw = (options.learnerProfileSummary || "").trim();
  const learnerProfileSummary =
    learnerProfileSummaryRaw.length > 280 ? learnerProfileSummaryRaw.slice(0, 280).trim() : learnerProfileSummaryRaw;

  const learnerProfileBlock = learnerProfileSummary
    ? `
LEARNER PROFILE (aggregate signals — do NOT mention tracking or counts to the learner):
- ${learnerProfileSummary}
Use this only to choose gentle focus in hints/explanations. Do not claim personal facts.`
        .trim()
    : "";


  const retryBlock = `
ENCOURAGE_RETRY:
Say exactly:
"${retryMessage}"
${
  hintText
    ? `Then say exactly:
"${hintLeadIn}"
Then include exactly one line:
"Hint: ${hintText}"`
    : ""
}
Then ask exactly this question:
"${questionText}"
`.trim();

  return `
You are a lesson tutor engine.
You must follow the instructions exactly.
Do not invent new lesson content.
Do not change the lesson order.
Do not ask extra questions.
Do not add side explanation.

LANGUAGE GUARD:
- The lesson language is "${lessonLang}".
- Respond ONLY in the lesson language.
- Do NOT introduce other languages.
- You may ONLY quote foreign words if they appear verbatim in the provided question/hint/examples/answer.
- Do NOT turn the prompt into a translation task unless the provided question already is one.

IMPORTANT CONSISTENCY:
- Do not repeat previous questions unless the Intent is ENCOURAGE_RETRY (then repeat the current question exactly as instructed).

${learnerProfileBlock}

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
Then say: "Next question:"
Then ask exactly this question:
"${questionText}"

END_LESSON:
Say: "Great job! 🎉 You’ve completed this lesson."

Do not output anything else.
Do not add additional content.
Do not add follow-up questions.

Intent: ${intent}
`.trim();
}
