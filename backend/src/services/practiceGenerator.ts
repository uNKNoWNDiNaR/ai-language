//backend/src/services/practiceGenerator.ts

import type { PracticeItem, PracticeMetaType, SupportedLanguage } from "../types";
import { isPracticeGenEnabled } from "../config/featureFlags";
import { validatePracticeItem } from "../validation/validatePracticeItem";

// We keep the AI call behind a tiny interface so tests can mock it easily.
// Wire this to your existing OpenAI client later (Step 1B/1C if needed).
export type PracticeAIClient = {
  generatePracticeJSON: (prompt: string) => Promise<string>;
};

export type GeneratePracticeParams = {
  language: SupportedLanguage;
  lessonId: string;

  // anchor to lesson content you already trust
  sourceQuestionText: string;
  expectedAnswerRaw: string;
  examples?: string[];

  conceptTag: string;
  type?: PracticeMetaType;
};

function titleCaseFromTag(tag: string | undefined): string {
  if (!tag) return "";
  return tag
    .replace(/[_-]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function ensureTerminalPunctuation(text: string): string {
  if (!text) return text;
  if (/[.!?]$/.test(text)) return text;
  return `${text}.`;
}

function buildReplyShortPrompt(answerRaw: string): string | null {
  const answer = (answerRaw || "").trim().toLowerCase();
  if (!answer) return null;
  if (answer.startsWith("yes")) return "Reply with yes.";
  if (answer.startsWith("no")) return "Reply with no.";
  return null;
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
  if (!answer) return null;
  if (!answer.endsWith("?")) return null;

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
  const answer = (answerRaw || "").trim().toLowerCase();
  if (!answer) return null;

  if (/^(hello|hi|hey)\b/.test(answer)) return "You meet someone. What do you say?";
  if (answer.startsWith("good morning")) return "It is morning. What do you say?";
  if (answer.startsWith("good afternoon")) return "It is afternoon. What do you say?";
  if (answer.startsWith("good evening")) return "It is evening. What do you say?";
  if (answer.startsWith("goodbye") || answer.startsWith("bye") || answer.startsWith("see you"))
    return "You are leaving. What do you say?";
  if (answer.startsWith("nice to meet you"))
    return "You are introduced to someone. What do you say?";
  if (answer.startsWith("thank you") || answer.startsWith("thanks"))
    return "Someone helps you. What do you say?";
  if (answer === "please." || answer === "please")
    return "You want to be polite. What do you say?";
  if (answer.startsWith("my name is"))
    return "Introduce yourself politely.";
  if (answer.startsWith("i'm fine") || answer.startsWith("i am fine"))
    return "Someone asks: How are you? What do you say?";

  return null;
}

function buildDeterministicPromptFromAnswer(
  answerRaw: string,
  type?: PracticeMetaType
): string | null {
  const answer = (answerRaw || "").trim();
  if (!answer) return null;

  const candidates: Array<() => string | null> = [];

  if (type === "cloze") {
    candidates.push(() => buildBlankAuxPrompt(answerRaw));
  }

  if (type === "dialogue_turn") {
    candidates.push(() => buildReplyShortPrompt(answerRaw));
    candidates.push(() => buildSituationCuePrompt(answerRaw));
  }

  candidates.push(
    () => buildBlankAuxPrompt(answerRaw),
    () => buildMakeQuestionPrompt(answerRaw),
    () => buildTransformSubjectPrompt(answerRaw),
    () => buildWordBankPrompt(answerRaw),
    () => buildSituationCuePrompt(answerRaw),
    () => buildReplyShortPrompt(answerRaw)
  );

  for (const build of candidates) {
    const prompt = build();
    if (prompt) return prompt;
  }

  return null;
}

function buildPracticePrompt(p: GeneratePracticeParams): string {
  const type = p.type ?? "variation";
  const examples = (p.examples && p.examples.length > 0) ? p.examples : undefined;

  // Strict JSON-only contract. No extra text.
  return [
    "You are generating ONE practice item for a calm language tutor.",
    "Return ONLY valid JSON. No markdown. No extra text.",
    "Do NOT include grading rules, rubrics, or evaluation criteria.",
    "Use only the provided lesson context. Do not invent new lesson content.",
    "RULES",
    `-Prompt language must be ${p.language}.`,
    "-Dont introduce other languages or translation prompts unless present in context.",
    "-Pratice must stay within sourceQuestionText/expectedAnswerRaw/examples only.",
    "",
    "JSON schema (keys must match exactly):",
    `{
      "practiceId": string,
      "lessonId": string,
      "language": "en" | "de" | "es" | "fr",
      "prompt": string,
      "expectedAnswerRaw": string,
      "examples": string[] (optional),
      "hint": string (optional),
      "hints": string[] (optional),
      "meta": { "type": "variation" | "dialogue_turn" | "cloze", "conceptTag": string }
    }`,
    "",
    "Lesson context:",
    `language: ${p.language}`,
    `lessonId: ${p.lessonId}`,
    `practiceType: ${type}`,
    `conceptTag: ${p.conceptTag}`,
    `sourceQuestionText: ${p.sourceQuestionText}`,
    `expectedAnswerRaw: ${p.expectedAnswerRaw}`,
    examples ? `examples: ${JSON.stringify(examples)}` : "examples: []",
    "",
    "Generate exactly one item that practices the SAME concept.",
    "Keep prompt short and friendly.",
  ].join("\n");
}

function normalizeForCompare(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildFallbackPromptBody(params: GeneratePracticeParams): string {
  const fromAnswer = buildDeterministicPromptFromAnswer(
    params.expectedAnswerRaw,
    params.type
  );
  if (fromAnswer) return fromAnswer;

  const label = titleCaseFromTag(params.conceptTag);
  if (label) return label;

  return "Short response.";
}

function fallbackPracticeItem(p: GeneratePracticeParams): PracticeItem {
  const type = p.type ?? "variation";
  const body = buildFallbackPromptBody(p);
  const prompt = body;

  return {
    practiceId: `fallback-${Date.now()}`,
    lessonId: p.lessonId,
    language: p.language,
    prompt,
    expectedAnswerRaw: p.expectedAnswerRaw,
    examples: p.examples,
    meta: { type, conceptTag: p.conceptTag },
  };
}

function safeParseJSON(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function passesDriftGuard(item: PracticeItem, p: GeneratePracticeParams): boolean {
  const prompt = String(item.prompt || "").toLowerCase();

  // Build "allowed context" from the trusted lesson anchor
  const ctx = [
    p.sourceQuestionText,
    p.expectedAnswerRaw,
    ...(p.examples ?? []),
  ]
    .join(" ")
    .toLowerCase();

  // If the prompt includes common foreign tokens that are NOT in context, reject.
  const suspicious = ["bonjour", "hola", "salut", "ciao", "guten tag"];
  for (const tok of suspicious) {
    if (prompt.includes(tok) && !ctx.includes(tok)) return false;
  }

  return true;
}

function isPromptTooCloseToSource(prompt: string, sourceQuestionText: string): boolean {
  const normalizedPrompt = normalizeForCompare(prompt);
  const normalizedSource = normalizeForCompare(sourceQuestionText);
  if (!normalizedPrompt || !normalizedSource) return false;
  if (normalizedPrompt === normalizedSource) return true;
  if (normalizedPrompt.includes(normalizedSource)) return true;
  return false;
}


export async function generatePracticeItem(
  params: GeneratePracticeParams,
  aiClient?: PracticeAIClient,
  options?: { forceEnabled?: boolean}, 
): Promise<{ item: PracticeItem; source: "fallback" | "ai" }> {


  // Flag off: always fallback (no AI usage)
  const enabled =
  typeof options?.forceEnabled === "boolean"
    ? options.forceEnabled
    : isPracticeGenEnabled();

// Flag off: always fallback (no AI usage)
 if (!enabled) {
  return { item: fallbackPracticeItem(params), source: "fallback" };
    }


  // If enabled but no client provided, still be safe.
  if (!aiClient) {
    return { item: fallbackPracticeItem(params), source: "fallback" };
  }

  const prompt = buildPracticePrompt(params);

  // Try up to 2 times (initial + 1 retry)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await aiClient.generatePracticeJSON(prompt);
    const parsed = safeParseJSON(raw);

    if (!parsed) continue;

    const validated = validatePracticeItem(parsed);
    if (validated.ok) {
      if (!passesDriftGuard(validated.value, params)) continue;
      if (isPromptTooCloseToSource(
        String(validated.value.prompt || ""),
        params.sourceQuestionText
      )) {
        continue;
      }
      return { item: validated.value, source: "ai" };
    }
  }

  return { item: fallbackPracticeItem(params), source: "fallback" };


}
