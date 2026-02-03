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
  // We intentionally do NOT require hints/answers to appear in the tutor message anymore.
  // Only keep minimal allowed context for drift checks.
  return [i.questionText, i.retryMessage, i.forcedAdvanceMessage]
    .map((x) => norm(String(x || "")))
    .filter(Boolean)
    .join("\n");
}

function hasOtherLanguageDrift(i: TutorGuardInput): boolean {
  const msg = norm(i.message);
  if (!msg) return true;

  const ctx = buildAllowedContext(i);

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

  if (msg.length > 1200) return false;
  if (hasOtherLanguageDrift(i)) return false;
  if (violatesCalmTone(msg)) return false;
  if (violatesContinuityPrivacy(msg)) return false;

  if (i.intent === "ASK_QUESTION") {
    return contains(msg, "let's begin") && contains(msg, i.questionText);
  }

  if (i.intent === "ADVANCE_LESSON") {
    return contains(msg, "next question") && contains(msg, i.questionText);
  }

  if (i.intent === "ENCOURAGE_RETRY") {
    const retry = norm(i.retryMessage || "");
    if (retry && !contains(msg, retry)) return false;
    return contains(msg, i.questionText);
  }

  if (i.intent === "FORCED_ADVANCE") {
    const forced = norm(i.forcedAdvanceMessage || "");
    if (forced && !contains(msg, forced)) return false;

    const q = norm(i.questionText);
    if (q && !contains(msg, q)) return false;

    return true;
  }

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
    return [retryMessage || "Not quite — try again.", questionText].filter(Boolean).join("\n");
  }

  if (i.intent === "FORCED_ADVANCE") {
    const forcedAdvanceMessage = norm(i.forcedAdvanceMessage || "");
    if (!questionText) return forcedAdvanceMessage || "That one was tricky — let's continue.";
    return [forcedAdvanceMessage || "That one was tricky — let's continue.", `Next question:\n"${questionText}"`]
      .filter(Boolean)
      .join("\n");
  }

  return "Great job! 🎉 You've completed this lesson.";
}
