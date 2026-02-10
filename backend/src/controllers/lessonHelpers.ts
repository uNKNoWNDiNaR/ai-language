//backend/src/controllers/lessonHelpers.ts

import { SupportedLanguage } from "../types";
import { LessonState } from "../state/lessonState";
import { TutorIntent } from "../ai/tutorIntent";
import { Lesson } from "../state/lessonLoader";
import { getHelpText } from "../content/instructionPacks/index";
import { resolveHelp } from "../content/helpResolver";


export function isSupportedLanguage(v: unknown): v is SupportedLanguage {
  return v === "en" || v === "de" || v === "es" || v === "fr";
}

export function normalizeLanguage(v: unknown): SupportedLanguage | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return isSupportedLanguage(t) ? (t as SupportedLanguage) : null;
}

export function getTutorIntent(state: LessonState, isCorrect?: boolean, markNeedsReview?: boolean): TutorIntent {
  if (state === "COMPLETE") return "END_LESSON";
  if (state === "ADVANCE") return markNeedsReview ? "FORCED_ADVANCE" : "ADVANCE_LESSON";
  if (isCorrect === false) return "ENCOURAGE_RETRY";
  return "ASK_QUESTION";
}


type HintResponse = { level: number; text: string };

type HintOptions = {
  instructionLanguage?: SupportedLanguage | null;
  targetLanguage?: SupportedLanguage | null;
  supportLevel?: number;
  recentConfusion?: boolean;
  includeSupport?: boolean;
};

function resolveConceptTag(question: any): string {
  if (question && typeof question.helpKey === "string" && question.helpKey.trim()) {
    return question.helpKey.trim();
  }
  if (question && typeof question.conceptTag === "string") {
    return question.conceptTag.trim();
  }
  return "";
}

export function chooseHintForAttempt(
  question: any,
  attemptCount: number,
  opts?: HintOptions
): HintResponse | undefined {
  // Attempt 1 -> no hint
  if (attemptCount <= 1) return undefined;

  const conceptTag = resolveConceptTag(question);
  const instructionLanguage = opts?.instructionLanguage ?? undefined;
  const targetLanguage = opts?.targetLanguage ?? "en";
  const supportLevel = typeof opts?.supportLevel === "number" ? opts.supportLevel : 0.85;
  const recentConfusion = Boolean(opts?.recentConfusion);

  const help = resolveHelp(
    question,
    attemptCount,
    targetLanguage,
    (instructionLanguage ?? targetLanguage) as SupportedLanguage,
    supportLevel,
    recentConfusion,
    opts?.includeSupport
  );

  const pack = conceptTag ? getHelpText(conceptTag, instructionLanguage ?? undefined) : {};

  // Support BOTH formats:
  // - hint?: string (legacy)
  // - hints?: string[] (new)
  const hintsArr: string[] = Array.isArray(question.hints) ? question.hints : [];
  const legacyHint: string = typeof question.hint === "string" ? question.hint : "";
  const resolvedHint = (help.hintText || "").trim();
  const hint1 = (pack.hint1 || hintsArr[0] || legacyHint || "").trim();
  const hint2 = (pack.hint2 || hintsArr[1] || hintsArr[0] || legacyHint || "").trim();

  // Attempt 2 -> light hint
  if (attemptCount === 2) {
    const text = resolvedHint || hint1;
    if (!text) return undefined;
    return { level: 1, text };
  }

  // Attempt 3 -> stronger hint
  if (attemptCount === 3) {
    const text = resolvedHint || hint2;
    if (!text) return undefined;
    return { level: 2, text };
  }

  // Attempt 4+ -> reveal explanation + answer (Explanation first)
  const rawExplanation =
    (help.explanationText && help.explanationText.trim()) ||
    (pack.explanation && pack.explanation.trim()) ||
    (typeof question.explanation === "string" ? question.explanation.trim() : "");
  const explanation = rawExplanation || "This is the expected structure for this question.";

  const rawAnswer = typeof question.answer === "string" ? question.answer.trim() : String(question.answer ?? "").trim();
  const answer = rawAnswer || "—";

  const reveal = `Explanation: ${explanation}\nAnswer: ${answer}`;
  return { level: 3, text: reveal };
}

type ProgressPayload = {
  currentQuestionIndex: number;
  totalQuestions: number;
  status: "in_progress" | "completed" | "needs_review";
};

export function buildProgressPayload(
  session: any,
  lesson: Lesson,
  statusOverride?: ProgressPayload["status"],
): ProgressPayload {
  const total = Array.isArray(lesson.questions) ? lesson.questions.length : 0;
  const idx = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;

  const safeTotal = total > 0 ? total : 1;

  const clampedIdx = Math.max(0, Math.min(safeTotal - 1, idx));

  const status: ProgressPayload["status"] =
    statusOverride ?? (session.state === "COMPLETE" ? "completed" : "in_progress");

  return { 
    currentQuestionIndex: clampedIdx,
    totalQuestions: safeTotal, 
    status,
  };
}
