//backend/src/ai/tutorOutputGuard.ts

// backend/src/ai/tutorOutputGuard.ts

import type { TutorIntent } from "./tutorIntent";
import type { SupportedLanguage } from "../types";
import { violatesCalmTone } from "./calmToneGuard";
import { violatesContinuityPrivacy } from "./continuityPrivacyGuard";

export type TutorGuardInput = {
  intent: TutorIntent;
  language: SupportedLanguage;
  message: string;
  questionText: string;
  retryMessage?: string;
  hintText?: string;
  hintLeadIn?: string;
  forcedAdvanceMessage?: string;
  revealAnswer?: string;
};

function norm(s: string): string {
  return String(s || "").trim();
}

function contains(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  return n.length > 0 && h.includes(n);
}

function buildAllowedContext(i: TutorGuardInput): string {
  return [
    i.questionText,
    i.retryMessage,
    i.hintText,
    i.hintLeadIn,
    i.forcedAdvanceMessage,
    i.revealAnswer,
  ]
    .map((x) => norm(String(x || "")))
    .filter(Boolean)
    .join("\n");
}

function hasOtherLanguageDrift(i: TutorGuardInput): boolean {
  const msg = norm(i.message);
  if (!msg) return true;

  const ctx = buildAllowedContext(i);

  // tokens that usually indicate “wrong language mode”
  // Allow them ONLY if they appear in the deterministic context (question/hint/etc).
  const forbiddenByLang: Record<SupportedLanguage, RegExp[]> = {
    en: [/german/i, /deutsch/i, /french/i, /fran[çc]ais/i, /spanish/i, /espa[ñn]ol/i],
    de: [/english/i, /french/i, /fran[çc]ais/i, /spanish/i, /espa[ñn]ol/i],
    fr: [/english/i, /german/i, /deutsch/i, /spanish/i, /espa[ñn]ol/i],
    es: [/english/i, /german/i, /deutsch/i, /french/i, /fran[çc]ais/i],
  };

  const forbidden = forbiddenByLang[i.language] || [];
  for (const re of forbidden) {
    if (re.test(msg) && !re.test(ctx)) return true;
  }

  return false;
}

export function isTutorMessageAcceptable(i: TutorGuardInput): boolean {
  const msg = norm(i.message);
  if (!msg) return false;

  // hard size guard (prevents rambles)
  if (msg.length > 1200) return false;

  // language drift guard
  if (hasOtherLanguageDrift(i)) return false;
  if (violatesCalmTone(msg)) return false;
  if (violatesContinuityPrivacy(msg)) return false;


  // intent contract enforcement (matches your promptBuilder “say exactly” style)
  if (i.intent === "ASK_QUESTION") {
    return contains(msg, "let's begin") && contains(msg, i.questionText);
  }

  if (i.intent === "ADVANCE_LESSON") {
    return contains(msg, "next question") && contains(msg, i.questionText);
  }

  if (i.intent === "ENCOURAGE_RETRY") {
    const retry = norm(i.retryMessage || "");
    if (retry && !contains(msg, retry)) return false;

    const hintText = norm(i.hintText || "");
    if (hintText && !contains(msg, hintText)) return false;

    return contains(msg, i.questionText);
  }

  if (i.intent === "FORCED_ADVANCE") {
    const forced = norm(i.forcedAdvanceMessage || "");
    const ans = norm(i.revealAnswer || "");
    if (forced && !contains(msg, forced)) return false;
    if (ans && !contains(msg, ans)) return false;

    // If we have a next question, it must be present
    const q = norm(i.questionText);
    if (q && !contains(msg, q)) return false;

    return true;
  }

  // END_LESSON
  return /completed this lesson/i.test(msg) || /great job/i.test(msg);
}

export function buildTutorFallback(i: TutorGuardInput): string {
  const questionText = norm(i.questionText);

  if (i.intent === "ASK_QUESTION") {
    return `Let's begin.\n${questionText}`;
  }

  if (i.intent === "ADVANCE_LESSON") {
    return `Nice work! Next question:\n"${questionText}"`;
  }

  if (i.intent === "ENCOURAGE_RETRY") {
    const retryMessage = norm(i.retryMessage || "");
    const hintText = norm(i.hintText || "");
    const hintLeadIn = norm(i.hintLeadIn || "");

    const lines: string[] = [];
    if (retryMessage) lines.push(retryMessage);

    if (hintText) {
      if (hintLeadIn) lines.push(hintLeadIn);
      lines.push(`Hint: ${hintText}`);
    }

    lines.push(questionText);
    return lines.filter(Boolean).join("\n");
  }

  if (i.intent === "FORCED_ADVANCE") {
    const forcedAdvanceMessage = norm(i.forcedAdvanceMessage || "");
    const revealAnswer = norm(i.revealAnswer || "");

    const lines: string[] = [];
    if (forcedAdvanceMessage) lines.push(forcedAdvanceMessage);
    if (revealAnswer) lines.push(`The correct answer is: ${revealAnswer}`);

    if (questionText) {
      lines.push(`Next question:\n"${questionText}"`);
    }

    return lines.filter(Boolean).join("\n");
  }

  return "Great job! 🎉 You've completed this lesson.";
}
