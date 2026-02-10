// backend/src/services/reviewPrompt.ts

import type { SupportedLanguage } from "../types";
import { generatePracticeItem } from "./practiceGenerator";
import { generatePracticeJSON } from "../ai/openaiClient";

type ReviewPromptParams = {
  language: SupportedLanguage;
  lessonId: string;
  sourceQuestionText: string;
  expectedAnswerRaw: string;
  examples?: string[];
  conceptTag: string;
  promptStyle?: string;
};

function normalizeForCompare(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeForLeakCheck(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAnswer(prompt: string, answer: string): boolean {
  const normalizedAnswer = normalizeForLeakCheck(answer);
  if (!normalizedAnswer || normalizedAnswer.length <= 3) return false;
  const normalizedPrompt = normalizeForLeakCheck(prompt);
  return normalizedPrompt.includes(normalizedAnswer);
}

function ensureTerminalPunctuation(text: string): string {
  if (!text) return text;
  if (/[.!?]$/.test(text)) return text;
  return `${text}.`;
}

function titleCase(input: string): string {
  if (!input) return "";
  return input
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .trim();
}

export function buildReviewFallbackPrompt(args: {
  sourceQuestionText: string;
  conceptTag?: string;
}): string {
  const raw = (args.sourceQuestionText || "").trim();
  if (!raw) return "Practice: Respond naturally.";

  const stripped = raw.replace(/[?]+$/g, "").trim();
  const lower = stripped.toLowerCase();
  let prompt = stripped;

  if (lower.startsWith("how do you say")) {
    const rest = stripped.slice("How do you say".length).trim();
    prompt = `Say ${rest}`.trim();
  } else if (lower.startsWith("how do you ask")) {
    const rest = stripped.slice("How do you ask".length).trim();
    prompt = rest ? `Ask ${rest}` : "Ask in a natural way";
  } else if (lower.startsWith("how do you introduce")) {
    prompt = "Introduce yourself politely";
  } else if (lower.startsWith("reply to")) {
    const rest = stripped.slice("Reply to".length).trim();
    prompt = rest ? `Reply naturally to ${rest}` : "Reply naturally";
  } else if (lower.startsWith("respond to")) {
    const rest = stripped.slice("Respond to".length).trim();
    prompt = rest ? `Respond naturally to ${rest}` : "Respond naturally";
  } else if (lower.startsWith("how do you")) {
    const rest = stripped.slice("How do you".length).trim();
    prompt = rest ? `Please ${rest}` : "Please respond naturally";
  }

  prompt = prompt.replace(/\s+/g, " ").trim();
  if (prompt && !/[.!?]$/.test(prompt)) {
    prompt = `${prompt}.`;
  }

  const normalizedPrompt = normalizeForCompare(prompt);
  const normalizedRaw = normalizeForCompare(raw);

  if (!normalizedPrompt || normalizedPrompt === normalizedRaw) {
    const conceptLabel = args.conceptTag
      ? titleCase(args.conceptTag.replace(/_/g, " ").trim())
      : "";
    if (conceptLabel) return `Practice: ${conceptLabel}.`;
    return "Practice: Respond naturally.";
  }

  return prompt;
}

const REVIEW_STYLE_ALTS: Record<string, string[]> = {
  BLANK_AUX: ["TRANSFORM_SUBJECT", "MAKE_QUESTION", "WORD_BANK", "SITUATION_CUE"],
  TRANSFORM_SUBJECT: ["BLANK_AUX", "MAKE_QUESTION", "WORD_BANK", "SITUATION_CUE"],
  MAKE_QUESTION: ["BLANK_AUX", "TRANSFORM_SUBJECT", "WORD_BANK", "SITUATION_CUE"],
  WORD_BANK: ["BLANK_AUX", "SITUATION_CUE", "TRANSFORM_SUBJECT", "MAKE_QUESTION"],
  SITUATION_CUE: ["WORD_BANK", "TRANSFORM_SUBJECT", "BLANK_AUX", "MAKE_QUESTION"],
  REPLY_SHORT: ["MAKE_QUESTION", "BLANK_AUX", "TRANSFORM_SUBJECT", "WORD_BANK"],
};

function extractQuestion(text: string): string | null {
  if (!text) return null;
  const idx = text.indexOf("?");
  if (idx < 0) return null;
  const lastColon = text.lastIndexOf(":", idx);
  const start = lastColon >= 0 ? lastColon + 1 : 0;
  const raw = text.slice(start, idx + 1).trim();
  return raw ? raw : null;
}

function buildReplyShortPrompt(answerRaw: string, sourceQuestionText: string): string | null {
  const answer = (answerRaw || "").trim();
  const lower = answer.toLowerCase();
  const polarity = lower.startsWith("yes") ? "yes" : lower.startsWith("no") ? "no" : "";
  if (!polarity) return null;

  const question = extractQuestion(sourceQuestionText);
  if (question) {
    return polarity === "yes"
      ? `Reply yes to: ${question}`
      : `Reply no to: ${question}`;
  }

  return polarity === "yes" ? "Reply with yes." : "Reply with no.";
}

function buildBlankAuxPrompt(answerRaw: string): string | null {
  const answer = (answerRaw || "").trim();
  if (!answer) return null;

  const patterns: RegExp[] = [
    /\b(am|is|are)\b/i,
    /\b(a|an|the)\b/i,
    /\b(at|on|in)\b/i,
    /\b(do|does)\b/i,
    /\b(can)\b/i,
    /\b(to)\b/i,
    /\b(doesn['\u2019]t|don['\u2019]t|can['\u2019]t|isn['\u2019]t|aren['\u2019]t)\b/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(answer)) {
      const blanked = answer.replace(pattern, "___");
      return ensureTerminalPunctuation(`Complete: ${blanked}`);
    }
  }

  return null;
}

function buildTransformSubjectPrompt(answerRaw: string): string | null {
  const answer = (answerRaw || "").trim();
  if (!answer) return null;

  const swaps: Array<[RegExp, string]> = [
    [/\bmy\b/i, "your"],
    [/\byour\b/i, "my"],
    [/\bhis\b/i, "her"],
    [/\bher\b/i, "his"],
    [/\bhe\b/i, "she"],
    [/\bshe\b/i, "he"],
    [/\bi\b/i, "you"],
    [/\byou\b/i, "I"],
    [/\bwe\b/i, "they"],
    [/\bthey\b/i, "we"],
  ];

  for (const [pattern, replacement] of swaps) {
    const match = answer.match(pattern);
    if (!match) continue;
    const original = match[0];
    let rep = replacement;
    if (original[0] && original[0] === original[0].toUpperCase()) {
      rep = rep[0].toUpperCase() + rep.slice(1);
    }
    const alt = answer.replace(pattern, rep);
    if (alt.trim() === answer) continue;
    return ensureTerminalPunctuation(`Change "${alt}" to "${original.toLowerCase()}".`);
  }

  return null;
}

function buildMakeQuestionPrompt(answerRaw: string): string | null {
  const answer = (answerRaw || "").trim();
  if (!answer || !answer.endsWith("?")) return null;

  const withoutMark = answer.slice(0, -1).trim();
  const lower = withoutMark.toLowerCase();
  const whMatch = lower.match(/^(where|what|when|who|why|how)\b/);
  if (whMatch) {
    const rest = withoutMark.slice(whMatch[1].length).trim();
    if (rest) {
      return ensureTerminalPunctuation(`Ask a ${whMatch[1]} question about: ${rest}.`);
    }
  }

  const auxMatch = lower.match(/^(do|does|can|is|are|am|did|will)\b/);
  if (auxMatch) {
    const rest = withoutMark.slice(auxMatch[1].length).trim();
    if (rest) {
      return ensureTerminalPunctuation(`Turn into a question: ${rest}.`);
    }
  }

  return ensureTerminalPunctuation(`Ask a question about: ${withoutMark}.`);
}

function buildWordBankPrompt(answerRaw: string): string | null {
  const answer = (answerRaw || "").trim();
  if (!answer) return null;
  const tokens = answer
    .replace(/["\u201c\u201d]/g, "")
    .replace(/[.,!?]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const reordered =
    tokens.length > 2 ? [tokens[tokens.length - 1], ...tokens.slice(0, -1)] : tokens.reverse();
  return ensureTerminalPunctuation(`Make a sentence: ${reordered.join(" / ")}`);
}

function buildSituationCuePrompt(answerRaw: string): string | null {
  const answer = (answerRaw || "").trim();
  if (!answer) return null;
  const lower = answer.toLowerCase();

  if (/^(hello|hi|hey)\b/.test(lower)) return "You meet someone. What do you say?";
  if (lower.startsWith("good morning")) return "It is morning. What do you say?";
  if (lower.startsWith("good afternoon")) return "It is afternoon. What do you say?";
  if (lower.startsWith("good evening")) return "It is evening. What do you say?";
  if (lower.startsWith("goodbye") || lower.startsWith("bye") || lower.startsWith("see you"))
    return "You are leaving. What do you say?";
  if (lower.startsWith("nice to meet you"))
    return "You are introduced to someone. What do you say?";
  if (lower.startsWith("thank you") || lower.startsWith("thanks"))
    return "Someone helps you. What do you say?";
  if (lower === "please." || lower === "please")
    return "You want to be polite. What do you say?";
  if (lower.startsWith("my name is"))
    return "Introduce yourself politely.";
  if (lower.startsWith("i'm fine") || lower.startsWith("i am fine"))
    return "Someone asks: How are you? What do you say?";

  return null;
}

function buildPromptForStyle(style: string, params: ReviewPromptParams): string | null {
  switch (style) {
    case "BLANK_AUX":
      return buildBlankAuxPrompt(params.expectedAnswerRaw);
    case "TRANSFORM_SUBJECT":
      return buildTransformSubjectPrompt(params.expectedAnswerRaw);
    case "MAKE_QUESTION":
      return buildMakeQuestionPrompt(params.expectedAnswerRaw);
    case "WORD_BANK":
      return buildWordBankPrompt(params.expectedAnswerRaw);
    case "SITUATION_CUE":
      return buildSituationCuePrompt(params.expectedAnswerRaw);
    case "REPLY_SHORT":
      return buildReplyShortPrompt(params.expectedAnswerRaw, params.sourceQuestionText);
    default:
      return null;
  }
}

function isUsablePrompt(
  prompt: string | null,
  sourceQuestionText: string,
  expectedAnswerRaw: string
): prompt is string {
  if (!prompt) return false;
  const normalizedPrompt = normalizeForCompare(prompt);
  if (!normalizedPrompt) return false;
  if (normalizedPrompt === normalizeForCompare(sourceQuestionText)) return false;
  if (normalizedPrompt === normalizeForCompare(expectedAnswerRaw)) return false;
  if (containsAnswer(prompt, expectedAnswerRaw)) return false;
  return true;
}

function buildReviewPromptDeterministic(params: ReviewPromptParams): string | null {
  if (params.language !== "en") return null;
  if (!params.expectedAnswerRaw) return null;

  const yesNoPrompt = buildReplyShortPrompt(
    params.expectedAnswerRaw,
    params.sourceQuestionText
  );
  if (isUsablePrompt(yesNoPrompt, params.sourceQuestionText, params.expectedAnswerRaw)) {
    return yesNoPrompt;
  }

  const altStyles = REVIEW_STYLE_ALTS[params.promptStyle || ""] || [
    "TRANSFORM_SUBJECT",
    "BLANK_AUX",
    "MAKE_QUESTION",
    "WORD_BANK",
    "SITUATION_CUE",
  ];

  for (const style of altStyles) {
    if (style === "REPLY_SHORT") continue;
    const candidate = buildPromptForStyle(style, params);
    if (isUsablePrompt(candidate, params.sourceQuestionText, params.expectedAnswerRaw)) {
      return candidate;
    }
  }

  return null;
}

export async function buildReviewPrompt(params: ReviewPromptParams): Promise<string> {
  const deterministic = buildReviewPromptDeterministic(params);
  if (deterministic) return deterministic;

  try {
    const { item, source } = await generatePracticeItem(
      {
        language: params.language,
        lessonId: params.lessonId,
        sourceQuestionText: params.sourceQuestionText,
        expectedAnswerRaw: params.expectedAnswerRaw,
        examples: params.examples,
        conceptTag: params.conceptTag,
        type: "variation",
      },
      { generatePracticeJSON },
      { forceEnabled: true }
    );

    if (source === "ai" && item?.prompt) {
      const trimmed = String(item.prompt).trim();
      if (trimmed) return trimmed;
    }
  } catch {
    // fall through to deterministic fallback
  }

  return buildReviewFallbackPrompt({
    sourceQuestionText: params.sourceQuestionText,
    conceptTag: params.conceptTag,
  });
}
