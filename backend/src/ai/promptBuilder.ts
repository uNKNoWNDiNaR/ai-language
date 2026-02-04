// backend/src/ai/promptBuilder.ts

import type { TutorIntent } from "./tutorIntent";

export type BuildTutorPromptCtx = {
  retryMessage?: string;
  hintText?: string;
  hintLeadIn?: string;
  forcedAdvanceMessage?: string;
  revealAnswer?: string;
  learnerProfileSummary?: string;
  explanationText?: string;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function buildTutorPrompt(
  session: any,
  intent: TutorIntent,
  questionText: string,
  ctx: BuildTutorPromptCtx = {}
): string {
  const lang = safeStr(session?.language) || "en";

  const retryMessage = safeStr(ctx.retryMessage).trim();
  const hintText = safeStr(ctx.hintText).trim();
  const hintLeadIn = safeStr(ctx.hintLeadIn).trim();
  const forcedAdvanceMessage = safeStr(ctx.forcedAdvanceMessage).trim();
  const revealAnswer = safeStr(ctx.revealAnswer).trim();
  const learnerProfileSummary = safeStr(ctx.learnerProfileSummary).trim();
  const explanationText = safeStr(ctx.explanationText).trim();

  const languageGuard = [
    `LANGUAGE GUARD:`,
    `- The lesson language is "${lang}".`,
    `- Respond ONLY in the lesson language.`,
    `- do NOT introduce other languages.`,
    `- ONLY quote foreign words that appear in the question text.`,
    `- do NOT turn the prompt into a translation task.`,
    ``,
    `Hard rules:`,
    `- Only respond in the lesson language: ${lang}`,
    `- Do NOT invent lesson content.`,
    `- Do NOT add extra questions.`,
    `- Keep responses short and calm.`,
    `- IMPORTANT: The UI shows hints/corrections separately. Do NOT include hints, answers, or correction explanations in your message.`,
  ].join("\n");

  const learnerProfileBlock = learnerProfileSummary
    ? [
        ``,
        `LEARNER PROFILE:`,
        `${learnerProfileSummary}`,
        `Hard rules:`,
        `- do NOT mention tracking or counts (no “I noticed you struggle with...” / no metrics).`,
        `- Use this ONLY to shape tone and pacing.`,
      ].join("\n")
    : "";

  const sessionBlock = [
    ``,
    `Session:`,
    `- userId: ${safeStr(session?.userId)}`,
    `- lessonId: ${safeStr(session?.lessonId)}`,
    `- state: ${safeStr(session?.state)}`,
    `- currentQuestionIndex: ${String(session?.currentQuestionIndex ?? 0)}`,
  ].join("\n");

  const intentBlock: string[] = [];
  intentBlock.push(``);
  intentBlock.push(`Intent: ${intent}`);
  intentBlock.push(``);

  // These “intent templates” are deterministic on purpose (tests rely on stability).
  intentBlock.push(`When intent is ASK_QUESTION:`);
  intentBlock.push(`Respond with EXACTLY:`);
  intentBlock.push(`Let's begin.`);
  intentBlock.push(questionText ? questionText : "");

  intentBlock.push(``);
  intentBlock.push(`When intent is ADVANCE_LESSON:`);
  intentBlock.push(`Respond with EXACTLY:`);
  intentBlock.push(`Nice work! Next question:`);
  intentBlock.push(questionText ? `"${questionText}"` : "");

  intentBlock.push(``);
  intentBlock.push(`When intent is ENCOURAGE_RETRY:`);
  intentBlock.push(`Respond with EXACTLY:`);
  intentBlock.push(retryMessage ? retryMessage : `Not quite — try again.`);
  if (hintLeadIn && hintText) {
    intentBlock.push(`${hintLeadIn} ${hintText}`.trim());
  }
  intentBlock.push(questionText ? questionText : "");

  intentBlock.push(``);
  intentBlock.push(`When intent is FORCED_ADVANCE:`);
  intentBlock.push(`You are moving on after too many attempts.`);
  intentBlock.push(`Do NOT reveal the answer in your message (UI shows it separately).`);
  if (forcedAdvanceMessage) {
    intentBlock.push(`Respond with EXACTLY:`);
    intentBlock.push(forcedAdvanceMessage);
  } else {
    intentBlock.push(`Respond with EXACTLY:`);
    intentBlock.push(`That one was tricky — let's continue.`);
  }
  if (questionText) {
    intentBlock.push(`Next question:`);
    intentBlock.push(`"${questionText}"`);
  } else {
    intentBlock.push(`If questionText is empty, omit the Next question lines.`);
  }

  intentBlock.push(``);
  intentBlock.push(`When intent is END_LESSON:`);
  intentBlock.push(`Respond with EXACTLY:`);
  intentBlock.push(`Great job! 🎉 You've completed this lesson.`);

  // NOTE: explanationText / revealAnswer are intentionally NOT placed in the tutor message.
  // UI handles them separately.

  return [
    `You are a calm, patient language tutor.`,
    ``,
    languageGuard,
    learnerProfileBlock,
    sessionBlock,
    intentBlock.join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}
