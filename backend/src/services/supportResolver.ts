// backend/src/services/supportResolver.ts

import type { SupportedLanguage } from "../types";
import { generateTutorResponse } from "../ai/openaiClient";
import {
  validateJsonShape,
  validateSupportLanguage,
  validateSupportLength,
} from "../ai/tutorOutputGuard";
import { getPackEntry, type PackEntry } from "../content/instructionPacks/index";
import { buildSupportFallback } from "./supportFallback";
import type { SupportEventType } from "./supportPolicy";

export type SupportContext = {
  targetLanguage: SupportedLanguage;
  instructionLanguage: SupportedLanguage;
  supportLevel: number;
  includeSupport: boolean;
  supportCharLimit: number;
  eventType: SupportEventType | string;
  conceptTag?: string;
  hintTarget?: string;
  explanationTarget?: string;
  repeatedConfusion?: boolean;
};

type SupportSource = "none" | "pack" | "ai" | "fallback";

function clean(text: unknown): string {
  return typeof text === "string" ? text.trim() : "";
}

function enforceCap(text: string, cap: number): string {
  if (!text) return "";
  if (!Number.isFinite(cap) || cap <= 0) return text;
  if (text.length <= cap) return text;
  return text.slice(0, cap).trim();
}

function isHintEvent(eventType: string): boolean {
  return eventType.startsWith("HINT_");
}

function isExplainEvent(eventType: string): boolean {
  return (
    eventType === "FORCED_ADVANCE" ||
    eventType === "EXPLAIN" ||
    eventType === "USER_CONFUSED" ||
    eventType === "USER_REQUESTED_EXPLAIN"
  );
}

function selectPackSupportText(entry: PackEntry, eventType: string): string {
  const type = eventType.toUpperCase();

  if (type === "WRONG_FEEDBACK") {
    return (
      clean(entry.feedbackWrong) ||
      clean(entry.explanation) ||
      clean(entry.hint?.[0]) ||
      clean(entry.summary)
    );
  }
  if (type === "ALMOST_FEEDBACK") {
    return (
      clean(entry.feedbackAlmost) ||
      clean(entry.explanation) ||
      clean(entry.hint?.[0]) ||
      clean(entry.summary)
    );
  }
  if (type === "CORRECT_FEEDBACK") {
    return clean(entry.summary) || clean(entry.explanation) || clean(entry.hint?.[0]);
  }

  if (isHintEvent(type)) {
    return clean(entry.hint?.[0]) || clean(entry.explanation) || clean(entry.summary);
  }

  if (isExplainEvent(type) || type === "INTRO_NEW_CONCEPT") {
    return clean(entry.explanation) || clean(entry.summary) || clean(entry.hint?.[0]);
  }

  if (type === "SESSION_SUMMARY") {
    return clean(entry.summary) || clean(entry.explanation) || clean(entry.hint?.[0]);
  }

  if (type === "SESSION_START") {
    return clean(entry.summary) || clean(entry.explanation) || clean(entry.hint?.[0]);
  }

  return "";
}

function selectFallbackFromPack(entry: PackEntry | null): string {
  if (!entry) return "";
  return clean(entry.explanation) || clean(entry.hint?.[0]) || clean(entry.summary);
}

function buildSupportPrompt(ctx: SupportContext): string {
  const eventType = String(ctx.eventType || "UNSPECIFIED").trim().toUpperCase();
  const hintTarget = clean(ctx.hintTarget);
  const explanationTarget = clean(ctx.explanationTarget);
  const anchor =
    isHintEvent(eventType) && hintTarget
      ? `Target-language hint (meaning only): "${hintTarget}"`
      : explanationTarget
        ? `Target-language explanation (meaning only): "${explanationTarget}"`
        : "";

  const goal = isHintEvent(eventType)
    ? "Give a short hint."
    : isExplainEvent(eventType)
      ? "Give a short, calm explanation."
      : eventType === "WRONG_FEEDBACK"
        ? "Give a short corrective tip."
        : eventType === "ALMOST_FEEDBACK"
          ? "Give a short tip to fix the mistake."
          : eventType === "CORRECT_FEEDBACK"
            ? "Give a brief, encouraging reinforcement."
            : "Give a short helpful line.";

  return [
    "You are a calm, patient language tutor.",
    `Instruction language: ${ctx.instructionLanguage}.`,
    `Target language: ${ctx.targetLanguage}.`,
    `Event type: ${eventType}.`,
    `Support char limit: ${ctx.supportCharLimit}.`,
    ctx.conceptTag ? `ConceptTag: ${ctx.conceptTag}.` : "",
    anchor,
    "",
    "Rules:",
    `- ${goal}`,
    "- supportText MUST be in the instruction language.",
    "- Do NOT include the target language in supportText.",
    "- Keep it short and specific. No shame or urgency.",
    "- Return ONLY valid JSON.",
    "",
    'Schema: {"primaryText":"","supportText":"..."}',
  ]
    .filter(Boolean)
    .join("\n");
}

export async function resolveSupportText(
  ctx: SupportContext
): Promise<{ supportText: string; source: SupportSource }> {
  if (!ctx.includeSupport) {
    return { supportText: "", source: "none" };
  }

  const cap =
    typeof ctx.supportCharLimit === "number" && Number.isFinite(ctx.supportCharLimit)
      ? Math.max(60, Math.floor(ctx.supportCharLimit))
      : 200;

  const packEntry = ctx.conceptTag
    ? getPackEntry(ctx.instructionLanguage, ctx.conceptTag)
    : null;
  const packText = packEntry ? selectPackSupportText(packEntry, String(ctx.eventType)) : "";

  if (packText) {
    return { supportText: enforceCap(packText, cap), source: "pack" };
  }

  const prompt = buildSupportPrompt(ctx);
  try {
    const response = await generateTutorResponse(prompt, "EXPLAIN_PRACTICE_RESULT", {
      temperature: 0.2,
      maxOutputTokens: 140,
      language: ctx.instructionLanguage,
    });

    const supportText = clean(response.supportText);
    const jsonOk = validateJsonShape(response);
    const supportOk =
      jsonOk &&
      supportText.length > 0 &&
      validateSupportLanguage(supportText, ctx.instructionLanguage) &&
      validateSupportLength(supportText, cap);

    if (supportOk) {
      return { supportText: enforceCap(supportText, cap), source: "ai" };
    }
  } catch {
    // fall through to fallback
  }

  const fallbackFromPack = selectFallbackFromPack(packEntry);
  const fallback =
    fallbackFromPack ||
    buildSupportFallback(ctx.instructionLanguage, ctx.supportLevel, ctx.eventType as SupportEventType);

  return { supportText: enforceCap(fallback, cap), source: "fallback" };
}
