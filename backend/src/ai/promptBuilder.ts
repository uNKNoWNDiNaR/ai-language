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
  instructionLanguage?: string;
  supportLevel?: number;
  supportTextDirective?: "include" | "omit";
  eventType?: string;
  includeSupport?: boolean;
  supportCharLimit?: number;
  conceptTag?: string;
  teachingPace?: string;
  explanationDepth?: string;
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
  const instructionLanguage = safeStr(ctx.instructionLanguage).trim();
  const supportLevel =
    typeof ctx.supportLevel === "number" && Number.isFinite(ctx.supportLevel)
      ? Math.max(0, Math.min(1, ctx.supportLevel))
      : 0.85;
  const supportTextDirective = ctx.supportTextDirective === "include" ? "include" : "omit";
  const isEnglish = lang === "en";
  const eventType = safeStr(ctx.eventType).trim() || "UNSPECIFIED";
  const includeSupport = ctx.includeSupport === true;
  const supportCharLimit =
    typeof ctx.supportCharLimit === "number" && Number.isFinite(ctx.supportCharLimit)
      ? Math.max(60, Math.floor(ctx.supportCharLimit))
      : supportLevel >= 0.75
        ? 280
        : supportLevel >= 0.4
          ? 200
          : 120;
  const conceptTag = safeStr(ctx.conceptTag).trim();
  const teachingPace = safeStr(ctx.teachingPace).trim();
  const explanationDepthPref = safeStr(ctx.explanationDepth).trim();

  const languageGuard = [
    `LANGUAGE GUARD:`,
    `- The lesson language is "${lang}".`,
    `- primaryText MUST be in the lesson language.`,
    `- supportText MUST be in the instruction language (or empty).`,
    `- Do NOT introduce other languages in primaryText.`,
    `- ONLY quote foreign words that appear in the question text.`,
    `- do NOT turn the prompt into a translation task.`,
    ``,
    `Hard rules:`,
    `- primaryText must use the lesson language: ${lang}`,
    `- Do NOT invent lesson content.`,
    `- Do NOT add extra questions.`,
    `- Keep responses short and calm.`,
    `- IMPORTANT: The UI shows hints/corrections separately. Do NOT include hints, answers, or correction explanations in primaryText.`,
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

  const instructionLanguageBlock = instructionLanguage
    ? [
        ``,
        `INSTRUCTION LANGUAGE:`,
        `- Instruction language for explanations/help is "${instructionLanguage}".`,
        `- supportText must use the instruction language.`,
        `- primaryText must stay in the lesson language.`,
      ].join("\n")
    : "";

  const supportRulesBlock = [
    ``,
    `SUPPORT RULES (summary):`,
    `- supportLevel is ${supportLevel.toFixed(2)}.`,
    `- eventType: ${eventType}.`,
    `- includeSupport: ${includeSupport ? "true" : "false"}.`,
    `- supportCharLimit: ${supportCharLimit} chars max.`,
    `- For this turn, supportText: ${supportTextDirective}.`,
    `- If supportText is omitted, output an empty string.`,
  ].join("\n");

  const outputFormatBlock = [
    ``,
    `OUTPUT FORMAT (strict JSON):`,
    `Return ONLY valid JSON, no markdown, no extra text.`,
    `Schema: {"primaryText":"...","supportText":"..."}`,
    `- Always include supportText (use an empty string if omitted).`,
  ].join("\n");

  const sessionBlock = [
    ``,
    `Session:`,
    `- userId: ${safeStr(session?.userId)}`,
    `- lessonId: ${safeStr(session?.lessonId)}`,
    `- state: ${safeStr(session?.state)}`,
    `- currentQuestionIndex: ${String(session?.currentQuestionIndex ?? 0)}`,
  ].join("\n");

  const conceptBlock = conceptTag
    ? [
        ``,
        `Concept:`,
        `- conceptTag: ${conceptTag}`,
      ].join("\n")
    : "";

  const teachingPrefsBlock = teachingPace || explanationDepthPref
    ? [
        ``,
        `Teaching Prefs:`,
        teachingPace ? `- pace: ${teachingPace}` : "",
        explanationDepthPref ? `- explanationDepth: ${explanationDepthPref}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const intentBlock: string[] = [];
  intentBlock.push(``);
  intentBlock.push(`Intent: ${intent}`);
  intentBlock.push(``);

  // These intent templates are deterministic for English to keep tests stable.
  intentBlock.push(`When intent is ASK_QUESTION:`);
  if (isEnglish) {
    intentBlock.push(`Set primaryText to EXACTLY:`);
    intentBlock.push(`Let's begin.`);
    intentBlock.push(questionText ? questionText : "");
  } else {
    intentBlock.push(
      `Set primaryText to a short, calm line in the lesson language, then the question text on a new line.`
    );
    if (questionText) intentBlock.push(questionText);
  }

  intentBlock.push(``);
  intentBlock.push(`When intent is ADVANCE_LESSON:`);
  if (isEnglish) {
    intentBlock.push(`Set primaryText to EXACTLY:`);
    intentBlock.push(`Nice work! Next question:`);
    intentBlock.push(questionText ? `"${questionText}"` : "");
  } else {
    intentBlock.push(
      `Set primaryText to a short positive transition in the lesson language, then the next question on a new line.`
    );
    if (questionText) intentBlock.push(questionText);
  }

  intentBlock.push(``);
  intentBlock.push(`When intent is ENCOURAGE_RETRY:`);
  if (isEnglish) {
    intentBlock.push(`Set primaryText to EXACTLY:`);
    intentBlock.push(retryMessage ? retryMessage : `Not quite — try again.`);
    if (hintText) {
      if (hintLeadIn) intentBlock.push(hintLeadIn);
      intentBlock.push(`Hint: ${hintText}`.trim());
    }
    intentBlock.push(questionText ? questionText : "");
  } else {
    intentBlock.push(
      `Set primaryText to a short retry line in the lesson language.`
    );
    if (hintText) {
      intentBlock.push(hintText);
    }
    if (questionText) intentBlock.push(questionText);
  }

  intentBlock.push(``);
  intentBlock.push(`When intent is FORCED_ADVANCE:`);
  intentBlock.push(`You are moving on after too many attempts.`);
  intentBlock.push(`Do NOT reveal the answer in primaryText (UI shows it separately).`);
  if (isEnglish) {
    if (forcedAdvanceMessage) {
      intentBlock.push(`Set primaryText to EXACTLY:`);
      intentBlock.push(forcedAdvanceMessage);
    } else {
      intentBlock.push(`Set primaryText to EXACTLY:`);
      intentBlock.push(`That one was tricky — let's continue.`);
    }
    if (questionText) {
      intentBlock.push(`Next question:`);
      intentBlock.push(`"${questionText}"`);
    } else {
      intentBlock.push(`If questionText is empty, omit the Next question lines.`);
    }
  } else {
    intentBlock.push(
      `Set primaryText to a short transition in the lesson language, then the next question on a new line (if any).`
    );
    if (questionText) intentBlock.push(questionText);
  }

  intentBlock.push(``);
  intentBlock.push(`When intent is END_LESSON:`);
  if (isEnglish) {
    intentBlock.push(`Set primaryText to EXACTLY:`);
    intentBlock.push(`Great job! 🎉 You've completed this lesson.`);
  } else {
    intentBlock.push(
      `Set primaryText to a calm completion line in the lesson language.`
    );
  }

  // NOTE: explanationText / revealAnswer are intentionally NOT placed in the tutor message.
  // UI handles them separately.

  return [
    `You are a calm, patient language tutor.`,
    ``,
    languageGuard,
    instructionLanguageBlock,
    supportRulesBlock,
    outputFormatBlock,
    learnerProfileBlock,
    sessionBlock,
    conceptBlock,
    teachingPrefsBlock,
    intentBlock.join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}
