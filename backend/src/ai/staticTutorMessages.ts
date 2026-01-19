// src/ai/staticTutorMessages.ts

import type { ReasonCode } from "../state/answerEvaluator";

export function getEndLessonMessage(): string {
  return "Great job! 🎉 You've completed this session.";
}

type RetryMessageArgs = {
  reasonCode?: ReasonCode;
  attemptCount: number;
  repeatedSameWrong: boolean;
};

export function getForcedAdvanceMessage(): string {
  return "That one was tricky - here's the correct answer, then we'll continue."
}

export function getDeterministicRetryMessage(args: RetryMessageArgs): string {
  const { reasonCode, attemptCount, repeatedSameWrong } = args;

  // If user repeats the same wrong answer, change strategy (still deterministic).
  if (repeatedSameWrong) {
    if(attemptCount <= 2) {
      return "You gave the same answer again - try changing one part of it.";
    }
    if(attemptCount === 3) {
      return "Same answer again - use the hint and adjust your wording.";
    }
    return "Let's move on - this one needs a different review.";
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

export function getHintLeadIn(attemptCount: number): string {
  if(attemptCount <= 2) return "Here's a small hint to help you.";
  if(attemptCount === 3) return "This hint should make it clearer.";
  return "Here's the answer.";
}