import type { TutorIntent } from "./tutorIntent";
import type { SupportedLanguage } from "../types";
import type { TeachingSupportLevel } from "../utils/supportLevel";

export type SupportPolicyInput = {
  intent: TutorIntent;
  pace: "slow" | "normal";
  explanationDepth: "short" | "normal" | "detailed";
  supportLevel: TeachingSupportLevel;
  instructionLanguage?: SupportedLanguage;
  lessonLanguage: SupportedLanguage;
  attemptCount?: number;
  isFirstQuestion?: boolean;
};

export type SupportPolicyResult = {
  supportMode: "A" | "B";
  includeSupport: boolean;
  supportLanguageStyle: "il_only" | "mixed" | "tl_only";
  maxSupportBullets: number;
};

function isQuestionIntent(intent: TutorIntent): boolean {
  return (
    intent === "ASK_QUESTION" ||
    intent === "ADVANCE_LESSON" ||
    intent === "ENCOURAGE_RETRY" ||
    intent === "FORCED_ADVANCE"
  );
}

export function computeSupportPolicy(input: SupportPolicyInput): SupportPolicyResult {
  const pace = input.pace === "slow" ? "slow" : "normal";
  const supportLevel = input.supportLevel ?? "high";
  const attemptCount = typeof input.attemptCount === "number" ? input.attemptCount : 1;
  const hasIL =
    Boolean(input.instructionLanguage) && input.instructionLanguage !== input.lessonLanguage;

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
    if (input.intent === "FORCED_ADVANCE") return true;
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
    supportLanguageStyle:
      supportLevel === "medium" && hasIL ? "mixed" : "tl_only",
    maxSupportBullets: 1,
  };
}
