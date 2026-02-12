// backend/src/services/quickReviewGenerator.ts

import type { Lesson, LessonQuestion } from "../state/lessonLoader";
import type { MicroPracticeItem, PracticeItem, SupportedLanguage } from "../types";
import { mapLikeGetNumber, type MapLike } from "../utils/mapLike";

type QuickReviewKind = MicroPracticeItem["kind"];

type QuickReviewCandidate = {
  question: LessonQuestion;
  conceptTag: string;
  attemptCount: number;
  kind: QuickReviewKind;
};

type QuickReviewResult = {
  items: MicroPracticeItem[];
  practiceItems: PracticeItem[];
};

type QuickReviewInput = {
  lesson: Lesson;
  language: SupportedLanguage;
  attemptCountByQuestionId?: MapLike<number>;
  maxItems?: number;
};

const SMART_APOSTROPHES = /[’‘]/g;

function normalizeLeak(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(SMART_APOSTROPHES, "'")
    .replace(/[.,!?;:"'()\[\]{}]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

const GENERIC_PROMPT_RE =
  /^(write|make)\s+(a\s+)?(short\s+)?sentence\.?$/i;

export function isPromptLeakingAnswer(prompt: string, answer: string): boolean {
  const p = normalizeLeak(prompt);
  const a = normalizeLeak(answer);
  if (!p || !a) return false;
  return p.includes(a);
}

function isGenericPrompt(prompt: string): boolean {
  const cleaned = (prompt || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "");
  if (!cleaned) return true;
  if (GENERIC_PROMPT_RE.test(cleaned)) return true;
  return cleaned === "short response";
}

function hasMeaningfulContext(prompt: string): boolean {
  const cleaned = (prompt || "")
    .replace(/_+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
  if (!cleaned) return false;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const genericWords = new Set([
    "complete",
    "fill",
    "blank",
    "answer",
    "write",
    "sentence",
    "short",
    "use",
    "make",
    "respond",
    "reply",
  ]);
  const meaningful = tokens.filter((t) => !genericWords.has(t.toLowerCase()));
  return meaningful.length > 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPromptPrefix(prompt: string): string {
  const raw = (prompt || "").trim();
  if (!raw) return raw;
  const colonIdx = raw.lastIndexOf(":");
  if (colonIdx !== -1) {
    const after = raw.slice(colonIdx + 1).trim();
    if (after.includes("___")) return after;
  }
  return raw;
}

function pickQuestionPrompt(question: LessonQuestion): string {
  const prompt = typeof question.prompt === "string" ? question.prompt.trim() : "";
  const questionText = typeof question.question === "string" ? question.question.trim() : "";
  return prompt || questionText;
}

function deriveBlankAnswers(prompt: string, answer: string): string[] {
  if (!prompt.includes("___")) return [];
  const template = stripPromptPrefix(prompt);
  if (!template.includes("___")) return [];
  const pattern = escapeRegExp(template).replace(/_+/g, "(.+?)");
  const re = new RegExp(`^${pattern}$`, "i");
  const match = (answer || "").trim().match(re);
  if (!match || match.length < 2) return [];
  const candidate = match[1]?.trim() ?? "";
  return candidate ? [candidate] : [];
}

function cleanStringList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getConceptTag(question: LessonQuestion, lessonId: string): string {
  const raw = typeof question.conceptTag === "string" ? question.conceptTag.trim() : "";
  if (raw) return raw;
  return `lesson-${lessonId}-q${question.id}`;
}

function extractQuestionHints(question: LessonQuestion): { hint?: string; hints?: string[] } {
  const hintTarget =
    typeof (question as any).hintTarget === "string" ? (question as any).hintTarget.trim() : "";
  const hintLegacy = typeof question.hint === "string" ? question.hint.trim() : "";
  const hints = Array.isArray((question as any).hints)
    ? (question as any).hints
        .map((h: unknown) => (typeof h === "string" ? h.trim() : ""))
        .filter(Boolean)
    : [];
  const hint = hintTarget || hintLegacy;
  return {
    ...(hint ? { hint } : {}),
    ...(hints.length ? { hints } : {}),
  };
}

function getKind(question: LessonQuestion): QuickReviewKind {
  const prompt = typeof question.prompt === "string" ? question.prompt : "";
  if (question.expectedInput === "blank") return "blank";
  if (question.promptStyle === "BLANK_AUX") return "blank";
  if (prompt.includes("___")) return "blank";
  if (question.promptStyle === "WORD_BANK") return "word_bank";
  return "short_answer";
}

function getAttemptCount(
  attempts: MapLike<number> | undefined,
  questionId: number
): number {
  if (!attempts) return 0;
  return mapLikeGetNumber(attempts, String(questionId), 0);
}

function buildBlankPrompt(
  question: LessonQuestion,
  promptOverride?: string
): { prompt: string; blankAnswers: string[] } | null {
  const answer = typeof question.answer === "string" ? question.answer.trim() : "";
  const rawPrompt = promptOverride ?? pickQuestionPrompt(question);
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
  const cleanedBlankAnswers = cleanStringList(question.blankAnswers);

  if (prompt && prompt.includes("___")) {
    const blanks =
      cleanedBlankAnswers.length > 0 ? cleanedBlankAnswers : deriveBlankAnswers(prompt, answer);
    if (blanks.length === 0) return null;
    if (!hasMeaningfulContext(prompt)) return null;
    return { prompt, blankAnswers: blanks };
  }

  if (!answer) return null;

  const blanks = cleanedBlankAnswers.length > 0 ? cleanedBlankAnswers : deriveBlankAnswers(prompt, answer);
  if (blanks.length === 0) return null;

  const target = blanks[0];
  const re = new RegExp(`\\b${escapeRegExp(target)}\\b`, "i");
  let sentenceWithBlank = answer.replace(re, "___");
  if (!sentenceWithBlank.includes("___")) {
    const fallbackRe = new RegExp(escapeRegExp(target), "i");
    sentenceWithBlank = answer.replace(fallbackRe, "___");
  }
  if (!sentenceWithBlank.includes("___")) return null;
  const finalPrompt = `Complete: ${sentenceWithBlank}`;
  if (!hasMeaningfulContext(finalPrompt)) return null;
  return { prompt: finalPrompt, blankAnswers: blanks };
}

function extractTokens(answer: string): string[] {
  if (!answer) return [];
  return answer
    .split(/\s+/)
    .map((token) => token.replace(/[.,!?;:"'()\[\]{}]/g, ""))
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildWordBankPrompt(answer: string): string {
  const tokens = extractTokens(answer);
  if (tokens.length === 0) return "";
  const sorted = [...tokens].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return `Make a sentence: ${sorted.join(" / ")}`;
}

function pickHintContext(question: LessonQuestion): string {
  const hintTarget =
    typeof (question as any).hintTarget === "string" ? (question as any).hintTarget.trim() : "";
  const explanationTarget =
    typeof (question as any).explanationTarget === "string"
      ? (question as any).explanationTarget.trim()
      : "";
  const hintSupport =
    typeof (question as any).hintSupport === "string" ? (question as any).hintSupport.trim() : "";
  const explanationSupport =
    typeof (question as any).explanationSupport === "string"
      ? (question as any).explanationSupport.trim()
      : "";
  const hintLegacy = typeof question.hint === "string" ? question.hint.trim() : "";
  const hints = Array.isArray((question as any).hints)
    ? (question as any).hints
        .map((h: unknown) => (typeof h === "string" ? h.trim() : ""))
        .filter(Boolean)
    : [];
  const raw =
    hintTarget ||
    explanationTarget ||
    hintSupport ||
    explanationSupport ||
    hintLegacy ||
    hints[0] ||
    "";
  if (!raw) return "";
  const match = raw.match(/^[^.!?]+[.!?](?=\s|$)/);
  return match ? match[0].trim() : raw;
}

function isHumanConceptTag(conceptTag: string): boolean {
  const tag = (conceptTag || "").trim();
  if (!tag) return false;
  if (tag.startsWith("lesson-")) return false;
  if (/^q\d+$/i.test(tag)) return false;
  return /[a-z]/i.test(tag);
}

function buildConceptPrompt(conceptTag: string): string {
  if (!isHumanConceptTag(conceptTag)) return "";
  const label = conceptTag.replace(/_/g, " ").trim();
  if (!label) return "";
  return `Write a short sentence about ${label}.`;
}

function maskToken(token: string): string {
  const cleaned = token.replace(/[^\p{L}\p{N}]/gu, "");
  if (!cleaned) return "";
  if (cleaned.length === 1) return "_";
  if (cleaned.length === 2) return `${cleaned[0]}_`;
  return `${cleaned[0]}${"_".repeat(cleaned.length - 2)}${cleaned[cleaned.length - 1]}`;
}

function buildMaskedTokenPrompt(answer: string): string {
  const tokens = extractTokens(answer);
  if (tokens.length === 0) return "";
  const masked = tokens.map(maskToken).filter(Boolean);
  if (masked.length === 0) return "";
  return `Write a short sentence using: ${masked.join(" / ")}`;
}

function buildSpecificSentencePrompt(
  question: LessonQuestion,
  answer: string,
  conceptTag: string
): string {
  const questionPrompt = pickQuestionPrompt(question);
  if (questionPrompt && !isGenericPrompt(questionPrompt) && !isPromptLeakingAnswer(questionPrompt, answer)) {
    return questionPrompt;
  }

  const hintContext = pickHintContext(question);
  if (hintContext) {
    const hintPrompt = hintContext.endsWith("?") ? hintContext : `Use: ${hintContext}`;
    if (!isGenericPrompt(hintPrompt) && !isPromptLeakingAnswer(hintPrompt, answer)) {
      return hintPrompt;
    }
  }

  const wordBank = buildWordBankPrompt(answer);
  if (wordBank && !isPromptLeakingAnswer(wordBank, answer)) {
    return wordBank;
  }

  const conceptPrompt = buildConceptPrompt(conceptTag);
  if (conceptPrompt && !isPromptLeakingAnswer(conceptPrompt, answer)) {
    return conceptPrompt;
  }

  const masked = buildMaskedTokenPrompt(answer);
  if (masked && !isPromptLeakingAnswer(masked, answer)) {
    return masked;
  }

  return "";
}

function buildMicroItem(
  candidate: QuickReviewCandidate,
  lessonId: string
): MicroPracticeItem | null {
  const answer = typeof candidate.question.answer === "string" ? candidate.question.answer.trim() : "";
  if (!answer) return null;

  const acceptedAnswers = cleanStringList(candidate.question.acceptedAnswers);
  const baseId = `qr-${lessonId}-${candidate.conceptTag}-${candidate.kind}-q${candidate.question.id}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_");

  const questionPrompt = pickQuestionPrompt(candidate.question);
  if (candidate.kind !== "blank" && questionPrompt.includes("___")) {
    const blank = buildBlankPrompt(candidate.question, questionPrompt);
    if (blank) {
      return {
        id: baseId,
        conceptTag: candidate.conceptTag,
        kind: "blank",
        prompt: blank.prompt,
        expectedInput: "blank",
        answer,
        acceptedAnswers: acceptedAnswers.length > 0 ? acceptedAnswers : undefined,
        blankAnswers: blank.blankAnswers,
      };
    }
  }

  if (candidate.kind === "blank") {
    const blank = buildBlankPrompt(candidate.question);
    if (!blank) return null;
    return {
      id: baseId,
      conceptTag: candidate.conceptTag,
      kind: "blank",
      prompt: blank.prompt,
      expectedInput: "blank",
      answer,
      acceptedAnswers: acceptedAnswers.length > 0 ? acceptedAnswers : undefined,
      blankAnswers: blank.blankAnswers,
    };
  }

  if (candidate.kind === "word_bank") {
    let prompt = buildWordBankPrompt(answer);
    if (!prompt || isPromptLeakingAnswer(prompt, answer) || isGenericPrompt(prompt)) {
      prompt = buildSpecificSentencePrompt(candidate.question, answer, candidate.conceptTag);
    }
    if (!prompt || isPromptLeakingAnswer(prompt, answer) || isGenericPrompt(prompt)) return null;
    return {
      id: baseId,
      conceptTag: candidate.conceptTag,
      kind: prompt.startsWith("Make a sentence:") ? "word_bank" : "short_answer",
      prompt,
      expectedInput: "sentence",
      answer,
      acceptedAnswers: acceptedAnswers.length > 0 ? acceptedAnswers : undefined,
    };
  }

  const prompt = buildSpecificSentencePrompt(candidate.question, answer, candidate.conceptTag);
  if (!prompt || isPromptLeakingAnswer(prompt, answer) || isGenericPrompt(prompt)) return null;

  return {
    id: baseId,
    conceptTag: candidate.conceptTag,
    kind: "short_answer",
    prompt,
    expectedInput: "sentence",
    answer,
    acceptedAnswers: acceptedAnswers.length > 0 ? acceptedAnswers : undefined,
  };
}

function toPracticeItem(
  item: MicroPracticeItem,
  lessonId: string,
  language: SupportedLanguage,
  question?: LessonQuestion
): PracticeItem {
  const questionHints = question ? extractQuestionHints(question) : {};
  return {
    practiceId: item.id,
    lessonId,
    language,
    prompt: item.prompt,
    expectedAnswerRaw: item.answer,
    acceptedAnswers: item.acceptedAnswers,
    expectedInput: item.expectedInput,
    blankAnswers: item.blankAnswers,
    ...(questionHints.hint ? { hint: questionHints.hint } : {}),
    ...(questionHints.hints ? { hints: questionHints.hints } : {}),
    meta: {
      type: item.kind === "blank" ? "cloze" : "variation",
      conceptTag: item.conceptTag,
    },
  };
}

function sortCandidates(a: QuickReviewCandidate, b: QuickReviewCandidate): number {
  if (a.attemptCount !== b.attemptCount) return b.attemptCount - a.attemptCount;
  return a.question.id - b.question.id;
}

function selectCandidates(candidates: QuickReviewCandidate[], targetCount: number): QuickReviewCandidate[] {
  const sorted = [...candidates].sort(sortCandidates);
  if (targetCount <= 1) return sorted.slice(0, targetCount);

  const kindTop = new Map<QuickReviewKind, QuickReviewCandidate>();
  for (const cand of sorted) {
    if (!kindTop.has(cand.kind)) kindTop.set(cand.kind, cand);
  }

  const topKinds = Array.from(kindTop.values()).sort(sortCandidates);
  const desiredKinds =
    topKinds.length >= 2 && targetCount >= 2 ? [topKinds[0].kind, topKinds[1].kind] : [];

  const used = new Set<string>();
  const selected: QuickReviewCandidate[] = [];

  for (const kind of desiredKinds) {
    const next = sorted.find((cand) => cand.kind === kind && !used.has(cand.conceptTag));
    if (next) {
      selected.push(next);
      used.add(next.conceptTag);
    }
  }

  for (const cand of sorted) {
    if (selected.length >= targetCount) break;
    if (used.has(cand.conceptTag)) continue;
    selected.push(cand);
    used.add(cand.conceptTag);
  }

  return selected;
}

export function generateQuickReviewItems(input: QuickReviewInput): QuickReviewResult {
  const { lesson, language } = input;
  const attemptMap = input.attemptCountByQuestionId;
  const maxItems = input.maxItems ?? 3;

  const candidatesMap = new Map<string, QuickReviewCandidate>();
  for (const question of lesson.questions ?? []) {
    if (!question || typeof question.id !== "number") continue;
    const conceptTag = getConceptTag(question, lesson.lessonId);
    const attemptCount = getAttemptCount(attemptMap, question.id);
    const kind = getKind(question);
    const candidate: QuickReviewCandidate = { question, conceptTag, attemptCount, kind };

    const existing = candidatesMap.get(conceptTag);
    if (!existing || sortCandidates(candidate, existing) < 0) {
      candidatesMap.set(conceptTag, candidate);
    }
  }

  const candidates = Array.from(candidatesMap.values());
  const targetCount = candidates.length >= maxItems ? maxItems : candidates.length >= 2 ? 2 : candidates.length;
  const selected = selectCandidates(candidates, targetCount);

  const items: MicroPracticeItem[] = [];
  const practiceItems: PracticeItem[] = [];
  const seenIds = new Set<string>();

  for (const candidate of selected) {
    const item = buildMicroItem(candidate, lesson.lessonId);
    if (!item) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    items.push(item);
    practiceItems.push(toPracticeItem(item, lesson.lessonId, language, candidate.question));
  }

  if (items.length < 2 && candidates.length > items.length) {
    const remaining = candidates.filter((cand) => !items.find((item) => item.conceptTag === cand.conceptTag));
    for (const cand of remaining) {
      if (items.length >= Math.min(maxItems, candidates.length)) break;
      const item = buildMicroItem(cand, lesson.lessonId);
      if (!item || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      items.push(item);
      practiceItems.push(toPracticeItem(item, lesson.lessonId, language, cand.question));
    }
  }

  return { items, practiceItems };
}
