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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function hasLanguageDrift(message: string, language: SupportedLanguage, context?: string): boolean {
  const msg = norm(message);
  if (!msg) return true;

  const ctx = norm(context || "");

  const forbiddenByLang: Record<SupportedLanguage, RegExp[]> = {
    en: [/german/i, /deutsch/i, /french/i, /fran[çc]ais/i, /spanish/i, /espa[ñn]ol/i],
    de: [/english/i, /french/i, /fran[çc]ais/i, /spanish/i, /espa[ñn]ol/i],
    fr: [/english/i, /german/i, /deutsch/i, /spanish/i, /espa[ñn]ol/i],
    es: [/english/i, /german/i, /deutsch/i, /french/i, /fran[çc]ais/i],
  };

  const forbidden = forbiddenByLang[language] || [];
  for (const re of forbidden) {
    if (re.test(msg) && !re.test(ctx)) return true;
  }
  return false;
}

export function isTutorMessageAcceptable(i: TutorGuardInput): boolean {
  const msg = norm(i.message);
  if (!msg) return false;

  if (msg.length > 1200) return false;
  if (hasLanguageDrift(msg, i.language, buildAllowedContext(i))) return false;
  if (violatesCalmTone(msg)) return false;
  if (violatesContinuityPrivacy(msg)) return false;

  if (i.intent === "ASK_QUESTION") {
    if (i.language === "en") {
      return contains(msg, "let's begin") && contains(msg, i.questionText);
    }
    return contains(msg, i.questionText);
  }

  if (i.intent === "ADVANCE_LESSON") {
    if (i.language === "en") {
      return contains(msg, "next question") && contains(msg, i.questionText);
    }
    return contains(msg, i.questionText);
  }

  if (i.intent === "ENCOURAGE_RETRY") {
    const retry = norm(i.retryMessage || "");
    if (i.language === "en" && retry && !contains(msg, retry)) return false;
    return contains(msg, i.questionText);
  }

  if (i.intent === "FORCED_ADVANCE") {
    const forced = norm(i.forcedAdvanceMessage || "");
    if (i.language === "en" && forced && !contains(msg, forced)) return false;

    const q = norm(i.questionText);
    if (q && !contains(msg, q)) return false;

    return true;
  }

  return /completed this lesson/i.test(msg) || /great job/i.test(msg);
}

export function validatePrimaryLanguage(text: string, targetLanguage: SupportedLanguage): boolean {
  const msg = norm(text);
  if (!msg) return false;
  return !hasLanguageDrift(msg, targetLanguage);
}

export function validateSupportLanguage(
  text: string,
  instructionLanguage: SupportedLanguage
): boolean {
  const msg = norm(text);
  if (!msg) return true;
  return !hasLanguageDrift(msg, instructionLanguage);
}

export function validateSupportLength(text: string, supportLevel: number): boolean {
  const msg = norm(text);
  if (!msg) return true;

  const levelOrCap = Number.isFinite(supportLevel) ? supportLevel : 0.85;
  const cap =
    levelOrCap > 1
      ? Math.floor(levelOrCap)
      : levelOrCap >= 0.75
        ? 280
        : levelOrCap >= 0.4
          ? 200
          : 120;
  return msg.length <= cap;
}

export function validateJsonShape(
  value: unknown
): value is { primaryText: string; supportText: string } {
  if (!isRecord(value)) return false;
  return typeof value.primaryText === "string" && typeof value.supportText === "string";
}

export function buildTutorFallback(i: TutorGuardInput): string {
  const questionText = norm(i.questionText);
  const isEnglish = i.language === "en";

  if (i.intent === "ASK_QUESTION") {
    return isEnglish ? `Let's begin.\n${questionText}` : questionText;
  }

  if (i.intent === "ADVANCE_LESSON") {
    return isEnglish ? `Nice work! Next question:\n"${questionText}"` : questionText;
  }

  if (i.intent === "ENCOURAGE_RETRY") {
    const retryMessage = norm(i.retryMessage || "");
    if (isEnglish) {
      return [retryMessage || "Not quite — try again.", questionText].filter(Boolean).join("\n");
    }
    return questionText || "...";
  }

  if (i.intent === "FORCED_ADVANCE") {
    const forcedAdvanceMessage = norm(i.forcedAdvanceMessage || "");
    if (!questionText) return forcedAdvanceMessage || "That one was tricky — let's continue.";
    if (isEnglish) {
      return [
        forcedAdvanceMessage || "That one was tricky — let's continue.",
        `Next question:\n"${questionText}"`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return questionText || "...";
  }

  return isEnglish ? "Great job! 🎉 You've completed this lesson." : "...";
}
