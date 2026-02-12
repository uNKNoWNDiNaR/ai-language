// frontend/src/components/Lesson.tsx

import { useEffect, useRef, useMemo, useState } from "react";
import {
  startLesson,
  submitAnswer,
  getSession,
  submitPractice,
  getSuggestedReview,
  getReviewCandidates,
  generateReviewQueue,
  generateQuickReview,
  submitReview,
  getLessonCatalog,
  getUserProgress,
  submitLessonFeedback,
  toUserSafeErrorMessage,
  getHttpStatus,
  type LessonSession,
  type ChatMessage,
  type SubmitAnswerResponse,
  type SubmitPracticeResponse,
  type LessonCatalogItem,
  type ProgressDoc,
  type LessonProgressPayload,
  type LessonQuestionMeta,
  type LessonTaskType,
  type TeachingPace,
  type ExplanationDepth,
  type TeachingPrefs,
  type SuggestedReviewItem,
  type ReviewCandidateItem,
  type ReviewSummary,
  type SupportedLanguage,
  type SupportLevel,
  type MicroPracticeItem,
  type LessonFeedbackQuickTag,
  type LessonFeedbackContext,
} from "../api/lessonAPI";
import {
  isInstructionLanguageEnabledFlag,
  normalizeInstructionLanguage,
  buildTeachingPrefsPayload,
  getUiStrings,
} from "../utils/instructionLanguage";
import { applyInstructionLanguageMeta } from "../utils/lessonMetaByIL";
import { getAnonUserId } from "../utils/anonId";
import {
  readTesterContext,
  saveTesterContext,
  dismissTesterContext,
  shouldShowTesterContext,
  type TesterContext,
} from "../utils/testerContext";
import {
  LessonShell,
  LessonSetupPanel,
  SessionHeader,
  ChatPane,
  SuggestedReviewCard,
  PracticeCard,
  AnswerBar,
  LessonFeedbackModal,
  FrictionFeedback,
} from "./lesson/index";
import settingsIcon from "../assets/settings.svg";
import { Badge, Button, Card, Chip, cn, type BadgeVariant } from "./ui";
import { FeedbackCard } from "./FeedbackCard";

const TARGET_LANGUAGE_KEY = "ai-language:targetLanguage";
const USER_ID_KEY = "ai-language:userId";
const LAST_SESSION_KEY_PREFIX = "ai-language:lastSessionKey:";
const LAST_SESSION_STATUS_PREFIX = "ai-language:lastSessionStatus:";
const LAST_COMPLETED_LESSON_PREFIX = "ai-language:lastCompletedLessonId:";
const SELECTED_LESSON_PREFIX = "ai-language:selectedLessonId:";
const LEGACY_LAST_SESSION_KEY = "ai-language:lastSessionKey";
const LEGACY_LAST_SESSION_STATUS_KEY = "ai-language:lastSessionStatus";
const LEGACY_LAST_COMPLETED_LESSON_KEY = "ai-language:lastCompletedLessonId";
const QUICK_REVIEW_DISMISS_PREFIX = "ai-language:quickReviewDismissed:";
const LESSON_FEEDBACK_SHOWN_PREFIX = "ai-language:lessonFeedbackShown:";
const FRICTION_PROMPT_SHOWN_PREFIX = "ai-language:frictionPromptShown:";
const QUICK_REVIEW_DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const TEACHING_PREFS_PREFIX = "ai-language:teachingPrefs:";

type TargetLanguage = "en" | "de";
type LanguageOption = {
  code: SupportedLanguage;
  label: string;
  flag: string;
  disabled?: boolean;
  note?: string;
};

const TARGET_LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "de", label: "German", flag: "🇩🇪" },
  { code: "es", label: "Spanish", flag: "🇪🇸", disabled: true, note: "will be added soon" },
  { code: "fr", label: "French", flag: "🇫🇷", disabled: true, note: "will be added soon" },
];

const INSTRUCTION_LANGUAGE_ENABLED = isInstructionLanguageEnabledFlag(
  import.meta.env.VITE_FEATURE_INSTRUCTION_LANGUAGE
);
const SUPPORT_LEVEL_ENABLED = isInstructionLanguageEnabledFlag(
  (import.meta as any).env?.VITE_FEATURE_SUPPORT_LEVEL ??
    import.meta.env.VITE_FEATURE_INSTRUCTION_LANGUAGE
);
const IS_DEV = Boolean(import.meta.env.DEV);
const AVAILABLE_INSTRUCTION_LANGUAGES: SupportedLanguage[] = ["en"];

function makeTeachingPrefsKey(userId: string, language: string): string {
  return makeScopedKey(TEACHING_PREFS_PREFIX, userId, language);
}

function makeLegacyTeachingPrefsKey(userId: string, language: string): string {
  const u = userId.trim();
  const l = language.trim();
  if (!u || !l) return "";
  return `${TEACHING_PREFS_PREFIX}${u}|${l}`;
}

function isTargetLanguage(v: unknown): v is TargetLanguage {
  return v === "en" || v === "de";
}

function normalizeUserId(value: string): string {
  return value.trim();
}

function readUserId(): string {
  try {
    const raw = localStorage.getItem(USER_ID_KEY);
    if (raw) return normalizeUserId(raw);
  } catch {
    // ignore
  }
  return "";
}

function writeUserId(userId: string) {
  const normalized = normalizeUserId(userId);
  try {
    if (!normalized) {
      localStorage.removeItem(USER_ID_KEY);
    } else {
      localStorage.setItem(USER_ID_KEY, normalized);
    }
  } catch {
    // ignore
  }
}

function readTargetLanguage(): TargetLanguage {
  try {
    const raw = localStorage.getItem(TARGET_LANGUAGE_KEY);
    return isTargetLanguage(raw) ? raw : "en";
  } catch {
    return "en";
  }
}

function writeTargetLanguage(language: SupportedLanguage) {
  if (!isTargetLanguage(language)) return;
  try {
    localStorage.setItem(TARGET_LANGUAGE_KEY, language);
  } catch {
    // ignore
  }
}

function makeScopedKey(prefix: string, userId: string, language: string): string {
  const u = userId.trim();
  const l = language.trim();
  if (!u || !l) return "";
  return `${prefix}${u}:${l}`;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeLessonFeedbackShownKey(
  userId: string,
  language: string,
  lessonId: string,
  dateKey: string
): string {
  const u = userId.trim();
  const l = language.trim();
  const lid = lessonId.trim();
  if (!u || !l || !lid || !dateKey) return "";
  return `${LESSON_FEEDBACK_SHOWN_PREFIX}${u}:${l}:${lid}:${dateKey}`;
}

function hasLessonFeedbackShown(
  userId: string,
  language: string,
  lessonId: string,
  dateKey: string
): boolean {
  const key = makeLessonFeedbackShownKey(userId, language, lessonId, dateKey);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markLessonFeedbackShown(
  userId: string,
  language: string,
  lessonId: string,
  dateKey: string
) {
  const key = makeLessonFeedbackShownKey(userId, language, lessonId, dateKey);
  if (!key) return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

function clearLessonFeedbackShown(
  userId: string,
  language: string,
  lessonId: string,
  dateKey: string
) {
  const key = makeLessonFeedbackShownKey(userId, language, lessonId, dateKey);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function makeFrictionPromptKey(sessionId: string, questionId: string): string {
  const sid = sessionId.trim();
  const qid = questionId.trim();
  if (!sid || !qid) return "";
  return `${FRICTION_PROMPT_SHOWN_PREFIX}${sid}:${qid}`;
}

function hasFrictionPromptShown(sessionId: string, questionId: string): boolean {
  const key = makeFrictionPromptKey(sessionId, questionId);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markFrictionPromptShown(sessionId: string, questionId: string) {
  const key = makeFrictionPromptKey(sessionId, questionId);
  if (!key) return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

function parseSessionKey(raw: string): { userId: string; language: string; lessonId: string } | null {
  const parts = raw.split("|");
  if (parts.length < 3) return null;
  const [u, l, lid] = parts;
  if (!u || !l || !lid) return null;
  return { userId: u, language: l, lessonId: lid };
}

function readLastSessionKey(userId: string, language: string): string {
  const key = makeScopedKey(LAST_SESSION_KEY_PREFIX, userId, language);
  if (key) {
    try {
      const scoped = localStorage.getItem(key);
      if (scoped) return scoped;
    } catch {
      // ignore
    }
  }

  try {
    const legacy = localStorage.getItem(LEGACY_LAST_SESSION_KEY);
    if (legacy) {
      const parsed = parseSessionKey(legacy);
      if (parsed && parsed.userId === userId && parsed.language === language) {
        return legacy;
      }
    }
  } catch {
    // ignore
  }

  return "";
}

function writeLastSessionKey(userId: string, language: string, value: string) {
  const key = makeScopedKey(LAST_SESSION_KEY_PREFIX, userId, language);
  if (!key) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function clearLastSessionKey(userId: string, language: string) {
  const key = makeScopedKey(LAST_SESSION_KEY_PREFIX, userId, language);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readLastSessionStatus(userId: string, language: string): "completed" | "in_progress" | "" {
  const key = makeScopedKey(LAST_SESSION_STATUS_PREFIX, userId, language);
  if (key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === "completed" || raw === "in_progress") return raw;
    } catch {
      // ignore
    }
  }

  try {
    const legacyKey = localStorage.getItem(LEGACY_LAST_SESSION_KEY);
    const legacyStatus = localStorage.getItem(LEGACY_LAST_SESSION_STATUS_KEY);
    if (legacyKey && legacyStatus) {
      const parsed = parseSessionKey(legacyKey);
      if (parsed && parsed.userId === userId && parsed.language === language) {
        return legacyStatus === "completed" || legacyStatus === "in_progress" ? legacyStatus : "";
      }
    }
  } catch {
    // ignore
  }

  return "";
}

function writeLastSessionStatus(
  userId: string,
  language: string,
  value: "completed" | "in_progress"
) {
  const key = makeScopedKey(LAST_SESSION_STATUS_PREFIX, userId, language);
  if (!key) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function clearLastSessionStatus(userId: string, language: string) {
  const key = makeScopedKey(LAST_SESSION_STATUS_PREFIX, userId, language);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readLastCompletedLessonId(userId: string, language: string): string {
  const key = makeScopedKey(LAST_COMPLETED_LESSON_PREFIX, userId, language);
  if (key) {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }
  try {
    return localStorage.getItem(LEGACY_LAST_COMPLETED_LESSON_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeLastCompletedLessonId(userId: string, language: string, lessonId: string) {
  const key = makeScopedKey(LAST_COMPLETED_LESSON_PREFIX, userId, language);
  if (!key) return;
  try {
    localStorage.setItem(key, lessonId);
  } catch {
    // ignore
  }
}

function readSelectedLessonId(userId: string, language: string): string {
  const key = makeScopedKey(SELECTED_LESSON_PREFIX, userId, language);
  if (!key) return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeSelectedLessonId(userId: string, language: string, lessonId: string) {
  const key = makeScopedKey(SELECTED_LESSON_PREFIX, userId, language);
  if (!key) return;
  try {
    localStorage.setItem(key, lessonId);
  } catch {
    // ignore
  }
}

function makeQuickReviewDismissKey(language: string, lessonId: string): string {
  const lang = language.trim();
  const lesson = lessonId.trim();
  if (!lang || !lesson) return "";
  return `${QUICK_REVIEW_DISMISS_PREFIX}${lang}:${lesson}`;
}

function readQuickReviewDismissed(language: string, lessonId: string): boolean {
  const key = makeQuickReviewDismissKey(language, lessonId);
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    const age = Date.now() - ts;
    if (age <= QUICK_REVIEW_DISMISS_TTL_MS) return true;
    localStorage.removeItem(key);
    return false;
  } catch {
    return false;
  }
}

function writeQuickReviewDismissed(language: string, lessonId: string) {
  const key = makeQuickReviewDismissKey(language, lessonId);
  if (!key) return;
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // ignore
  }
}

function isTeachingPace(v: unknown): v is TeachingPace {
  return v === "slow" || v === "normal";
}

function isExplanationDepth(v: unknown): v is ExplanationDepth {
  return v === "short" || v === "normal" || v === "detailed";
}

function isSupportLevel(v: unknown): v is SupportLevel {
  return v === "high" || v === "medium" || v === "low";
}

function normalizeSupportLevel(v: unknown, fallback: SupportLevel = "high"): SupportLevel {
  if (isSupportLevel(v)) return v;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n >= 0.75) return "high";
  if (n >= 0.4) return "medium";
  return "low";
}

function normalizeInstructionLanguagePreference(value: unknown): SupportedLanguage {
  const normalized = normalizeInstructionLanguage(value);
  if (normalized && AVAILABLE_INSTRUCTION_LANGUAGES.includes(normalized)) return normalized;
  return "en";
}

function readTeachingPrefs(primaryKey: string, fallbackKey?: string): TeachingPrefs | null {
  const readFromKey = (key: string): TeachingPrefs | null => {
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;

      const obj = parsed as {
        pace?: unknown;
        explanationDepth?: unknown;
        instructionLanguage?: unknown;
        supportLevel?: unknown;
      };

      const pace: TeachingPace = isTeachingPace(obj.pace) ? obj.pace : "normal";
      const explanationDepth: ExplanationDepth = isExplanationDepth(obj.explanationDepth)
        ? obj.explanationDepth
        : "normal";

      const instructionLanguage = normalizeInstructionLanguagePreference(obj.instructionLanguage);

      const supportLevel = normalizeSupportLevel(obj.supportLevel);

      return { pace, explanationDepth, instructionLanguage, supportLevel };
    } catch {
      return null;
    }
  };

  const primary = readFromKey(primaryKey);
  if (primary) return primary;
  if (fallbackKey) return readFromKey(fallbackKey);
  return null;
}

function writeTeachingPrefs(key: string, prefs: TeachingPrefs) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

function splitNextQuestion(text: string): { before: string; next: string } | null {
  const raw = (text ?? "");
  const idx = raw.toLowerCase().indexOf("next question:");
  if (idx === -1) return null;
  const before = raw.slice(0, idx).trim();
  const next = raw.slice(idx).trim();
  if (!before || !next) return null;
  return { before, next };
}

function splitPromptFromMessage(text: string, prompt: string): { before: string; next: string } | null {
  const raw = (text ?? "");
  const trimmedPrompt = (prompt ?? "").trim();
  if (!raw || !trimmedPrompt) return null;

  const candidates = [trimmedPrompt, `"${trimmedPrompt}"`, `“${trimmedPrompt}”`];
  let idx = -1;
  let used = "";
  for (const candidate of candidates) {
    const found = raw.lastIndexOf(candidate);
    if (found !== -1) {
      idx = found;
      used = candidate;
      break;
    }
  }
  if (idx === -1) return null;

  const before = (raw.slice(0, idx) + raw.slice(idx + used.length)).trim();
  return { before, next: trimmedPrompt };
}

function normalizeCompact(text: string): string {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTrailingNextLabel(text: string, label: string): string {
  if (!text || !label) return text;
  const re = new RegExp(`${escapeRegex(label)}\\s*$`, "i");
  return text.replace(re, "").trimEnd();
}

function getNextQuestionLabel(il: SupportedLanguage): string {
  switch (il) {
    case "de":
      return "Nächste Frage:";
    case "es":
      return "Siguiente pregunta:";
    case "fr":
      return "Question suivante :";
    default:
      return "Next question:";
  }
}

const LESSON_CONCEPTS: Record<string, string[]> = {
  "basic-1": ["greetings", "introductions", "polite phrases"],
  "basic-2": ["to be", "pronouns", "basic nouns"],
  "basic-3": ["articles", "simple statements", "word order"],
  "basic-4": ["negation", "adjectives", "numbers"],
  "basic-5": ["questions", "wh-words", "yes/no"],
  "basic-6": ["requests", "clarification", "help"],
  "basic-7": ["daily routines", "time phrases", "verbs"],
  "basic-8": ["directions", "locations", "prepositions"],
  "basic-9": ["food & drinks", "ordering", "quantities"],
  "basic-10": ["shopping", "prices", "preferences"],
  "basic-11": ["travel", "transport", "tickets"],
  "basic-12": ["plans", "future", "invitations"],
};

type LessonUnitDef = {
  key: string;
  label: string;
  order: number;
  range: [number, number];
};

const LESSON_UNITS: LessonUnitDef[] = [
  { key: "introductions", label: "Introductions", order: 1, range: [1, 1] },
  { key: "simple-sentences", label: "Simple sentences", order: 2, range: [2, 4] },
  { key: "questions", label: "Questions", order: 3, range: [5, 6] },
  { key: "everyday-use", label: "Everyday use", order: 4, range: [7, 12] },
];

const UNIT_LABELS_BY_IL_TARGET: Partial<
  Record<SupportedLanguage, Partial<Record<SupportedLanguage, Record<string, string>>>>
> = {
  en: {
    en: {
      introductions: "Introductions",
      "simple-sentences": "Simple sentences",
      questions: "Questions",
      "everyday-use": "Everyday use",
      other: "More lessons",
    },
    de: {
      introductions: "Greetings",
      "simple-sentences": "Basics & requests",
      questions: "Time & routines",
      "everyday-use": "Everyday use",
      other: "More lessons",
    },
  },
  de: {
    en: {
      introductions: "Einführungen",
      "simple-sentences": "Einfache Sätze",
      questions: "Fragen",
      "everyday-use": "Alltag",
      other: "Weitere Lektionen",
    },
    de: {
      introductions: "Begrüßungen",
      "simple-sentences": "Grundlagen & Bitten",
      questions: "Zeit & Routinen",
      "everyday-use": "Alltag",
      other: "Weitere Lektionen",
    },
  },
};

const STATUS_ACCENT: Record<string, string> = {
  not_started: "#E5E7EB",
  in_progress: "#2563EB",
  completed: "#16A34A",
  needs_review: "#D97706",
};

function getLessonNumber(lessonId: string): number | null {
  const match = lessonId.trim().match(/basic-(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLessonConcepts(lessonId: string): string[] {
  return LESSON_CONCEPTS[lessonId] ?? [];
}

function getLessonUnitDef(lessonId: string): LessonUnitDef {
  const lessonNumber = getLessonNumber(lessonId);
  if (lessonNumber !== null) {
    const match = LESSON_UNITS.find(
      (unit) => lessonNumber >= unit.range[0] && lessonNumber <= unit.range[1]
    );
    if (match) return match;
  }
  return { key: "other", label: "More lessons", order: 99, range: [0, 0] };
}

type LessonUnit = {
  key: string;
  label: string;
  order: number;
  lessons: LessonCatalogItem[];
};

type FrictionContext = {
  questionId: string;
  conceptTag?: string;
  promptStyle?: string;
  attempts: number;
  evaluationResult?: LessonFeedbackContext["evaluationResult"];
  reasonCode?: LessonFeedbackContext["reasonCode"];
};

function getUnitLabel(
  unitKey: string,
  instructionLanguage: SupportedLanguage,
  targetLanguage: SupportedLanguage
): string {
  const normalizedIL = normalizeInstructionLanguagePreference(instructionLanguage);
  const labelsForIL = UNIT_LABELS_BY_IL_TARGET[normalizedIL] ?? UNIT_LABELS_BY_IL_TARGET.en;
  const labelsForTarget = labelsForIL?.[targetLanguage] ?? labelsForIL?.en;
  const fallback =
    LESSON_UNITS.find((unit) => unit.key === unitKey)?.label ?? "More lessons";
  return labelsForTarget?.[unitKey] ?? fallback;
}

function buildLessonUnits(
  lessons: LessonCatalogItem[],
  instructionLanguage: SupportedLanguage,
  targetLanguage: SupportedLanguage
): LessonUnit[] {
  const grouped = new Map<string, LessonUnit>();
  const safeLessons = lessons.filter(
    (lesson) => lesson && typeof lesson.lessonId === "string" && lesson.lessonId.trim().length > 0
  );
  safeLessons.forEach((lesson) => {
    const unit = getLessonUnitDef(lesson.lessonId);
    const label = getUnitLabel(unit.key, instructionLanguage, targetLanguage);
    const existing = grouped.get(unit.key);
    if (existing) {
      existing.label = label;
      existing.lessons.push(lesson);
      return;
    }
    grouped.set(unit.key, {
      key: unit.key,
      label,
      order: unit.order,
      lessons: [lesson],
    });
  });
  grouped.forEach((unit) => {
    unit.lessons.sort((a, b) => {
      const aNum = getLessonNumber(a.lessonId) ?? 0;
      const bNum = getLessonNumber(b.lessonId) ?? 0;
      return aNum - bNum;
    });
  });
  return Array.from(grouped.values()).sort((a, b) => a.order - b.order);
}

function sanitizePracticeTutorMessage(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";

  const hasDebugLabels = /^result\s*:/im.test(t) || /^reason\s*:/im.test(t);
  if (!hasDebugLabels) return t;

  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const kept: string[] = [];

  for (const line of lines) {
    if (/^result\s*:/i.test(line)) continue;

    if (/^reason\s*:/i.test(line)) {
      const rest = line.replace(/^reason\s*:\s*/i, "").trim();
      if (rest) kept.push(rest);
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n").trim();
}

function stripPracticePrefix(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return raw;
  const stripped = raw.replace(/^\s*practice\s*[:\-–—]?\s*/i, "").trim();
  return stripped || raw;
}

function normalizeLessonCompleteMessage(value: string): string {
  return (value ?? "")
    .split(/\r?\n/)[0]
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
}

function parseRevealParts(text: string): { explanation: string; answer: string } | null {
  const t = (text ?? "").trim();
  if (!t) return null;

  const expMatch = t.match(/Explanation:\s*([\s\S]*?)(?:\nAnswer:|$)/i);
  const ansMatch = t.match(/Answer:\s*([\s\S]*)/i);

  const explanation = expMatch ? expMatch[1].trim() : "";
  const answer = ansMatch ? ansMatch[1].trim() : "";

  if (!explanation && !answer) return null;
  return { explanation, answer };
}

const REVEAL_PREFIX = "__REVEAL__";

function formatPromptForTaskType(prompt: string, taskType?: LessonTaskType): string {
  const raw = (prompt ?? "").trim();
  if (!raw) return raw;
  const sayPrefix = /^say\s*:/i;
  const speakPrefix = /\b(say|ask|reply)\s*:/gi;

  if (taskType === "speaking") {
    let lastIndex = -1;
    let lastMatch = "";
    let match: RegExpExecArray | null;
    while ((match = speakPrefix.exec(raw)) !== null) {
      lastIndex = match.index;
      lastMatch = match[0];
    }
    if (lastIndex >= 0) {
      const rest = raw.slice(lastIndex + lastMatch.length).trim();
      return rest ? `Say: ${rest}` : "Say:";
    }
    return `Say: ${raw}`;
  }

  if (sayPrefix.test(raw)) {
    return raw.replace(sayPrefix, "").trim();
  }

  return raw;
}

function replacePromptInText(text: string, rawPrompt: string, formattedPrompt: string): string {
  if (!text) return text;
  const raw = (rawPrompt ?? "").trim();
  const formatted = (formattedPrompt ?? "").trim();
  if (!raw || !formatted) return text;

  const candidates = [raw, `"${raw}"`, `“${raw}”`];
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const lineTrim = lines[i].trim();
    if (candidates.includes(lineTrim)) {
      lines[i] = lines[i].replace(lines[i].trim(), formatted);
      return lines.join("\n");
    }
  }

  const idx = text.lastIndexOf(raw);
  if (idx !== -1) {
    return text.slice(0, idx) + formatted + text.slice(idx + raw.length);
  }

  return text;
}

function applyQuestionMetaToMessages(
  messages: ChatMessage[],
  meta: LessonQuestionMeta | null
): ChatMessage[] {
  if (!meta?.prompt || messages.length === 0) return messages;
  const formattedPrompt = formatPromptForTaskType(meta.prompt, meta.taskType);
  if (!formattedPrompt) return messages;

  const lastAssistantIndex = [...messages]
    .map((m, idx) => (m.role === "assistant" ? idx : -1))
    .filter((idx) => idx >= 0)
    .slice(-1)[0];
  if (lastAssistantIndex === undefined) return messages;

  const msg = messages[lastAssistantIndex];
  if ((msg.content ?? "").startsWith(REVEAL_PREFIX)) return messages;

  const updatedContent = replacePromptInText(msg.content ?? "", meta.prompt, formattedPrompt);
  const updatedPrimary = msg.primaryText
    ? replacePromptInText(msg.primaryText, meta.prompt, formattedPrompt)
    : undefined;

  if (updatedContent === msg.content && updatedPrimary === msg.primaryText) return messages;

  const next = messages.slice();
  next[lastAssistantIndex] = {
    ...msg,
    content: updatedContent,
    ...(updatedPrimary !== undefined ? { primaryText: updatedPrimary } : {}),
  };
  return next;
}

export function Lesson() {
  const [userId, setUserId] = useState<string>(() => readUserId());
  const [userGateValue, setUserGateValue] = useState("");
  const [userGateError, setUserGateError] = useState<string | null>(null);
  const userGateInputRef = useRef<HTMLInputElement | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>(() => readTargetLanguage());
  const [lessonId, setLessonId] = useState(() => {
    const initialLang = readTargetLanguage();
    const stored = readSelectedLessonId(readUserId(), initialLang);
    return stored || "basic-1";
  });
  const [session, setSession] = useState<LessonSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questionMeta, setQuestionMeta] = useState<LessonQuestionMeta | null>(null);
  const [answer, setAnswer] = useState("");
  const [clozeEmptyError, setClozeEmptyError] = useState<string | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [practicePrompt, setPracticePrompt] = useState<string | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceTutorMessage, setPracticeTutorMessage] = useState<string | null>(null);
  const [, setPracticeAttemptCount] = useState<number | null>(null);
  const [practiceResult, setPracticeResult] = useState<SubmitPracticeResponse["result"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<
    null | "start" | "resume" | "answer" | "practice" | "review"
  >(null);
  const [progress, setProgress] = useState<LessonProgressPayload | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [practiceScreenOpen, setPracticeScreenOpen] = useState(false);
  const [teachingPace, setTeachingPace] = useState<TeachingPace>("normal");
  const [explanationDepth, setExplanationDepth] = useState<ExplanationDepth>("normal");
  const [instructionLanguage, setInstructionLanguage] = useState<SupportedLanguage>("en");
  const [supportLevel, setSupportLevel] = useState<SupportLevel>("high");
  const [teachingPrefsEpoch, setTeachingPrefsEpoch] = useState(0);
  const suppressTeachingPrefsWriteRef = useRef(false);

  const [suggestedReviewItems, setSuggestedReviewItems] = useState<SuggestedReviewItem[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [reviewItems, setReviewItems] = useState<SuggestedReviewItem[]>([]);
  const [reviewCandidates, setReviewCandidates] = useState<ReviewCandidateItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewTutorMessage, setReviewTutorMessage] = useState<string | null>(null);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [reviewScreenOpen, setReviewScreenOpen] = useState(false);
  const [reviewBanner, setReviewBanner] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState<null | "lesson" | "review">(null);

  const [quickReviewItems, setQuickReviewItems] = useState<MicroPracticeItem[]>([]);
  const [quickReviewIndex, setQuickReviewIndex] = useState(0);
  const [quickReviewAnswer, setQuickReviewAnswer] = useState("");
  const [quickReviewTutorMessage, setQuickReviewTutorMessage] = useState<string | null>(null);
  const [quickReviewResult, setQuickReviewResult] = useState<SubmitPracticeResponse["result"] | null>(null);
  const [quickReviewActive, setQuickReviewActive] = useState(false);
  const [quickReviewComplete, setQuickReviewComplete] = useState(false);
  const [quickReviewError, setQuickReviewError] = useState<string | null>(null);
  const [quickReviewDismissed, setQuickReviewDismissed] = useState(false);
  const [lessonFeedbackOpen, setLessonFeedbackOpen] = useState(false);
  const [lessonFeedbackContext, setLessonFeedbackContext] = useState<{
    userId: string;
    lessonId: string;
    language: SupportedLanguage;
    sessionId: string;
    instructionLanguage?: SupportedLanguage;
    supportLevel?: SupportLevel;
  } | null>(null);
  const [frictionContext, setFrictionContext] = useState<FrictionContext | null>(null);
  const [anonUserId] = useState(() => getAnonUserId());
  const [testerContext, setTesterContext] = useState<TesterContext | null>(null);
  const [showTesterContext, setShowTesterContext] = useState(false);
  const [testerLevel, setTesterLevel] = useState<TesterContext["selfReportedLevel"] | "">("");
  const [testerGoal, setTesterGoal] = useState<TesterContext["goal"] | "">("");

  const clozeInputRef = useRef<HTMLInputElement | null>(null);
  const quickReviewInputRef = useRef<HTMLInputElement | null>(null);

  const [catalog, setCatalog] = useState<LessonCatalogItem[]>([]);
  const [lastCompletedLessonId, setLastCompletedLessonId] = useState<string>(() =>
    readLastCompletedLessonId(readUserId(), readTargetLanguage())
  );
  const [nextLessonId, setNextLessonId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressDoc>>({});
  const [resumeLessonId, setResumeLessonId] = useState<string | null>(null);
  const [homeDataError, setHomeDataError] = useState<string | null>(null);
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});
  const [forceLessonComplete, setForceLessonComplete] = useState(false);

  const [lastSessionStatus, setLastSessionStatus] = useState<"in_progress" | "completed" | "">(
    () => readLastSessionStatus(readUserId(), readTargetLanguage())
  );


  const [lastSessionKey, setLastSessionKey] = useState<string>(() =>
    readLastSessionKey(readUserId(), readTargetLanguage())
  );

  const chatRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const practiceInputRef = useRef<HTMLInputElement | null>(null);
  const reviewInputRef = useRef<HTMLInputElement | null>(null);
  const quickReviewAutoAdvanceRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const prefsButtonRef = useRef<HTMLButtonElement | null>(null);
  const prefsMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollOnEnterRef = useRef(false);
  const lessonListRef = useRef<HTMLDivElement | null>(null);

  const practiceActive = useMemo(() => {
    return Boolean(practiceId && practicePrompt);
  }, [practiceId, practicePrompt]);

  const userReady = Boolean(userId.trim());
  const sessionActive = Boolean(session);
  const showHome = !sessionActive && !practiceScreenOpen && !reviewScreenOpen;
  const showConversation = sessionActive && !practiceScreenOpen && !reviewScreenOpen;
  const showHomeContent = showHome && userReady;
  const lessonCompleted = useMemo(() => {
    if (forceLessonComplete) return true;
    const status = (progress?.status ?? "").toLowerCase();
    return status === "completed" || status === "needs_review";
  }, [progress, forceLessonComplete]);

  const showPracticeScreen = practiceScreenOpen;
  const showReviewScreen = reviewScreenOpen;
  const reviewItemsAvailable =
    suggestedReviewItems.length > 0 || reviewCandidates.length > 0;
  const showResumePractice = practiceActive && !practiceScreenOpen;
  const busy = loading || pending !== null;
  const disableStartResume = busy || practiceActive || sessionActive || !userReady;
  const displayCatalog = useMemo(
    () => applyInstructionLanguageMeta(catalog, instructionLanguage, language),
    [catalog, instructionLanguage, language]
  );

  const noLessonsAvailable = displayCatalog.length === 0;
  const completedLessonId = (session?.lessonId ?? lessonId).trim();
  const currentQuickReviewItem =
    quickReviewItems.length > 0 ? quickReviewItems[Math.min(quickReviewIndex, quickReviewItems.length - 1)] : null;
  const quickReviewBlankActive = Boolean(
    currentQuickReviewItem &&
      (currentQuickReviewItem.expectedInput === "blank" ||
        (typeof currentQuickReviewItem.prompt === "string" &&
          currentQuickReviewItem.prompt.includes("___")))
  );
  const quickReviewPrompt = stripPracticePrefix(currentQuickReviewItem?.prompt ?? "");
  const quickReviewPromptParts = quickReviewPrompt.includes("___")
    ? quickReviewPrompt.split("___", 2)
    : [quickReviewPrompt, ""];
  const quickReviewPromptBefore = quickReviewPromptParts[0] ?? "";
  const quickReviewPromptAfter = quickReviewPromptParts[1] ?? "";
  const quickReviewCanSubmit = Boolean(quickReviewAnswer.trim()) && !loading;
  const quickReviewInputDisabled = loading || quickReviewResult === "correct";

  const inProgressSession = Boolean(session) && !lessonCompleted;
  const showSuggestedReview =
    !inProgressSession && !practiceActive && reviewItemsAvailable && !reviewDismissed;
  const isReviewPractice = practiceMode === "review";
  const showQuickReviewCard =
    lessonCompleted &&
    !practiceActive &&
    (quickReviewActive || quickReviewComplete || !quickReviewDismissed);
  const uiStrings = useMemo(
    () => getUiStrings(instructionLanguage ?? null),
    [instructionLanguage]
  );

  const lessonUnits = useMemo(
    () => buildLessonUnits(displayCatalog, instructionLanguage, language),
    [displayCatalog, instructionLanguage, language]
  );

  const heroLesson = useMemo(() => {
    if (!displayCatalog.length) return null;
    return (
      displayCatalog.find((lesson) => lesson.lessonId === lessonId) ??
      displayCatalog[0] ??
      null
    );
  }, [displayCatalog, lessonId]);

  const heroConcepts = useMemo(() => {
    if (!heroLesson) return [];
    return getLessonConcepts(heroLesson.lessonId).slice(0, 3);
  }, [heroLesson]);

  const inProgressLessonId = useMemo(() => {
    if (resumeLessonId) return resumeLessonId;
    const match = Object.values(progressMap).find(
      (doc) => doc?.status?.toLowerCase() === "in_progress"
    );
    return match?.lessonId ?? "";
  }, [progressMap, resumeLessonId]);

  const hintMessage = useMemo(() => {
    if (!hintText) return null;
    return `${uiStrings.hintLabel}\n${hintText}`;
  }, [hintText, uiStrings]);

  const normalizedLessonCompleteTitle = useMemo(
    () => normalizeLessonCompleteMessage(uiStrings.lessonCompleteTitle),
    [uiStrings]
  );

  const chatMessages = useMemo(() => {
    let nextMessages = messages;
    if (lessonCompleted && messages.length > 0) {
      const lastAssistantIndex = [...messages]
        .map((m, idx) => (m.role === "assistant" ? idx : -1))
        .filter((idx) => idx >= 0)
        .slice(-1)[0];
      if (lastAssistantIndex !== undefined) {
        const lastMsg = messages[lastAssistantIndex];
        const normalizedContent = normalizeLessonCompleteMessage(lastMsg.content);
        if (normalizedContent === normalizedLessonCompleteTitle) {
          nextMessages = messages.slice();
          nextMessages.splice(lastAssistantIndex, 1);
        }
      }
    }
    if (!hintMessage) return nextMessages;
    const hintMsg: ChatMessage = { role: "assistant", content: hintMessage };
    return [...nextMessages, hintMsg];
  }, [messages, hintMessage, lessonCompleted, normalizedLessonCompleteTitle]);

  const currentSessionKey = useMemo(() => {
    const u = userId.trim();
    const lid = lessonId.trim();
    if (!u || !lid) return "";
    return `${u}|${language}|${lid}`;
  }, [userId, language, lessonId]);

  const feedbackSessionKey = useMemo(() => {
    if (sessionActive) return currentSessionKey;
    return lastSessionKey || currentSessionKey;
  }, [sessionActive, currentSessionKey, lastSessionKey]);

  const teachingPrefsKey = useMemo(
    () => makeTeachingPrefsKey(userId, language),
    [userId, language]
  );
  const legacyTeachingPrefsKey = useMemo(
    () => makeLegacyTeachingPrefsKey(userId, language),
    [userId, language]
  );

  const currentLessonMeta = useMemo(() => {
    if (!session?.lessonId) return null;
    return displayCatalog.find((lesson) => lesson.lessonId === session.lessonId) ?? null;
  }, [displayCatalog, session?.lessonId]);

  useEffect(() => {
    suppressTeachingPrefsWriteRef.current = true;
    const loaded = readTeachingPrefs(teachingPrefsKey, legacyTeachingPrefsKey);
    if (loaded) {
      setTeachingPace(loaded.pace);
      setExplanationDepth(loaded.explanationDepth);
      setInstructionLanguage(loaded.instructionLanguage ?? "en");
      setSupportLevel(normalizeSupportLevel(loaded.supportLevel));
    } else {
      setTeachingPace("normal");
      setExplanationDepth("normal");
      setInstructionLanguage("en");
      setSupportLevel("high");
    }
    setTeachingPrefsEpoch((v) => v + 1);
  }, [teachingPrefsKey, legacyTeachingPrefsKey]);

  useEffect(() => {
    writeTargetLanguage(language);
  }, [language]);

  useEffect(() => {
    writeUserId(userId);
  }, [userId]);

  useEffect(() => {
    const stored = readTesterContext(anonUserId);
    setTesterContext(stored);
    if (stored) {
      setTesterLevel(stored.selfReportedLevel);
      setTesterGoal(stored.goal);
    }
    setShowTesterContext(shouldShowTesterContext(anonUserId));
  }, [anonUserId]);

  useEffect(() => {
    if (!userReady) {
      requestAnimationFrame(() => {
        userGateInputRef.current?.focus();
      });
    }
  }, [userReady]);

  useEffect(() => {
    if (!userId.trim()) {
      setLastSessionKey("");
      setLastSessionStatus("");
      setLastCompletedLessonId("");
      return;
    }
    setLastSessionKey(readLastSessionKey(userId, language));
    setLastSessionStatus(readLastSessionStatus(userId, language));
    setLastCompletedLessonId(readLastCompletedLessonId(userId, language));
    const storedLesson = readSelectedLessonId(userId, language);
    if (storedLesson) {
      setLessonId(storedLesson);
    } else {
      setLessonId("");
    }
  }, [userId, language]);

  useEffect(() => {
    if (suppressTeachingPrefsWriteRef.current) {
      suppressTeachingPrefsWriteRef.current = false;
      return;
    }
    writeTeachingPrefs(teachingPrefsKey, {
      pace: teachingPace,
      explanationDepth,
      instructionLanguage,
      supportLevel,
    });
  }, [
    teachingPrefsKey,
    teachingPace,
    explanationDepth,
    instructionLanguage,
    supportLevel,
    teachingPrefsEpoch,
  ]);

  useEffect(() => {
    if (!lessonId || catalog.length === 0) return;
    if (!catalog.some((lesson) => lesson.lessonId === lessonId)) return;
    writeSelectedLessonId(userId, language, lessonId);
  }, [lessonId, userId, language, catalog]);

  useEffect(() => {
    void refreshSuggestedReview();
  }, [userId, language]);

  useEffect(() => {
    setReviewDismissed(false);
    setSuggestedReviewItems([]);
    setReviewSummary(null);
    setReviewCandidates([]);
    stopReview();
  }, [userId, language]);

  useEffect(() => {
    if (reviewDismissed && (suggestedReviewItems.length > 0 || reviewCandidates.length > 0)) {
      setReviewDismissed(false);
    }
  }, [reviewDismissed, suggestedReviewItems.length, reviewCandidates.length]);

  useEffect(() => {
    if (!sessionActive || practiceScreenOpen || reviewScreenOpen || lessonCompleted) {
      setFrictionContext(null);
    }
  }, [sessionActive, practiceScreenOpen, reviewScreenOpen, lessonCompleted]);

  useEffect(() => {
    if (!lessonCompleted) {
      setQuickReviewItems([]);
      setQuickReviewIndex(0);
      setQuickReviewAnswer("");
      setQuickReviewTutorMessage(null);
      setQuickReviewResult(null);
      setQuickReviewActive(false);
      setQuickReviewComplete(false);
      setQuickReviewError(null);
      setQuickReviewDismissed(false);
      return;
    }
    if (!completedLessonId) return;
    setQuickReviewDismissed(readQuickReviewDismissed(language, completedLessonId));
  }, [lessonCompleted, completedLessonId, language]);

  const lastQuestionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = questionMeta?.id != null ? String(questionMeta.id) : null;
    if (!currentId) {
      lastQuestionIdRef.current = null;
      return;
    }
    if (lastQuestionIdRef.current && lastQuestionIdRef.current !== currentId) {
      setAnswer("");
      setClozeEmptyError(null);
    }
    lastQuestionIdRef.current = currentId;
  }, [questionMeta?.id]);

  useEffect(() => {
    if (!quickReviewActive) return;
    const handle = window.setTimeout(() => {
      quickReviewInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [quickReviewActive, quickReviewIndex]);

  useEffect(() => {
    return () => {
      if (quickReviewAutoAdvanceRef.current) {
        window.clearTimeout(quickReviewAutoAdvanceRef.current);
        quickReviewAutoAdvanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refreshHomeData(userId, language);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, language]);

  useEffect(() => {
    if (!catalog.length) {
      setNextLessonId(null);
      return;
    }
    const idx = catalog.findIndex((l) => l.lessonId === lessonId);
    setNextLessonId(idx >= 0 ? catalog[idx + 1]?.lessonId ?? null : null);
  }, [catalog, lessonId]);

  const nextLessonAfterLastCompleted = useMemo(() => {
    if (!lastCompletedLessonId || !catalog.length) return null;
    const idx = catalog.findIndex((l) => l.lessonId === lastCompletedLessonId);
    return idx >= 0 ? catalog[idx + 1]?.lessonId ?? null : null;
  }, [catalog, lastCompletedLessonId]);

  useEffect(() => {
    if (!lessonUnits.length) return;
    const inProgressUnitKey = inProgressLessonId
      ? getLessonUnitDef(inProgressLessonId).key
      : "";
    setOpenUnits((prev) => {
      let changed = false;
      const next = { ...prev };
      lessonUnits.forEach((unit, idx) => {
        if (next[unit.key] === undefined) {
          next[unit.key] = idx === 0;
          changed = true;
        }
      });
      if (inProgressUnitKey && !next[inProgressUnitKey]) {
        next[inProgressUnitKey] = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [lessonUnits, inProgressLessonId]);

  const teachingPrefsPayload = useMemo(
    () =>
      buildTeachingPrefsPayload({
        pace: teachingPace,
        explanationDepth,
        instructionLanguage,
        supportLevel,
        enableInstructionLanguage: INSTRUCTION_LANGUAGE_ENABLED,
      }),
    [teachingPace, explanationDepth, instructionLanguage, supportLevel]
  );


  const canResume =
    userReady && !busy && !practiceActive && !sessionActive && lastSessionStatus !== "completed";

  function isLessonResumable(lessonIdValue: string): boolean {
    if (!canResume) return false;
    const lid = lessonIdValue.trim();
    if (!lid) return false;
    const key = `${userId.trim()}|${language}|${lid}`;
    return (lastSessionKey && lastSessionKey === key) || resumeLessonId === lid;
  }

  const canResumeSelected = isLessonResumable(lessonId);

  const heroPrimaryLabel = canResumeSelected
    ? uiStrings.continueLabel ?? "Continue"
    : uiStrings.startLabel;
  const primaryActionDisabled = canResumeSelected
    ? false
    : disableStartResume || noLessonsAvailable;
  const emptyLessonsMessage =
    language === "de" ? "German lessons are being prepared." : uiStrings.noLessonsLabel;
  const userRequiredMessage = !userReady ? "Enter a username to start." : "";

  function getLessonStatusInfo(lessonIdValue: string): {
    status: string;
    statusLabel: string;
    resumable: boolean;
    accent: string;
  } {
    const status = progressMap[lessonIdValue]?.status?.toLowerCase() ?? "not_started";
    const resumable = isLessonResumable(lessonIdValue);
    const statusLabel =
      status === "in_progress"
        ? resumable
          ? uiStrings.statusInProgress
          : uiStrings.statusPaused
        : status === "completed"
          ? uiStrings.statusCompleted
          : status === "needs_review"
            ? uiStrings.statusNeedsReview
            : uiStrings.statusNotStarted;
    return {
      status,
      resumable,
      statusLabel,
      accent: STATUS_ACCENT[status] ?? STATUS_ACCENT.not_started,
    };
  }

  function shouldRestartLesson(lessonIdValue: string): boolean {
    const status = progressMap[lessonIdValue]?.status?.toLowerCase() ?? "";
    return status === "completed" || status === "needs_review";
  }

  function getBadgeVariant(status: string): BadgeVariant {
    switch (status) {
      case "in_progress":
        return "progress";
      case "completed":
        return "success";
      case "needs_review":
        return "warning";
      default:
        return "neutral";
    }
  }

  const heroStatus = heroLesson ? getLessonStatusInfo(heroLesson.lessonId) : null;

  const formattedPrompt = useMemo(() => {
    if (!questionMeta?.prompt) return "";
    return formatPromptForTaskType(questionMeta.prompt, questionMeta.taskType);
  }, [questionMeta]);

  const isClozePrompt = useMemo(() => {
    if (!questionMeta?.prompt) return false;
    if (questionMeta.taskType === "speaking") return false;
    return (
      questionMeta.expectedInput === "blank" || questionMeta.prompt.includes("___")
    );
  }, [questionMeta]);

  const canSubmitAnswer = useMemo(() => {
    return (
      Boolean(session) &&
      answer.trim().length > 0 &&
      !loading &&
      !practiceActive &&
      !lessonCompleted
    );
  }, [session, answer, loading, practiceActive, lessonCompleted]);

  const clozeHelperText = isClozePrompt && !lessonCompleted ? "Type the missing word." : "";

  const canSubmitPractice = useMemo(() => {
    return Boolean(practiceId) && practiceAnswer.trim().length > 0 && !loading;
  }, [practiceId, practiceAnswer, loading]);

  const currentReviewItem = useMemo(() => {
    if (reviewComplete) return null;
    return reviewItems[reviewIndex] ?? null;
  }, [reviewItems, reviewIndex, reviewComplete]);

  const canSubmitReview = Boolean(currentReviewItem) && reviewAnswer.trim().length > 0 && !loading;

  const reviewFocusNext = useMemo(() => {
    const raw = reviewSummary?.focusNext ?? [];
    return raw.filter(Boolean).slice(0, 2);
  }, [reviewSummary]);

  const reviewIntroMessage = uiStrings.reviewIntroMessage ?? "Let's do a quick review.";
  const showReviewIntro = Boolean(currentReviewItem) && reviewIndex === 0 && !reviewComplete;
  const reviewPromptText = currentReviewItem
    ? [
        showReviewIntro ? reviewIntroMessage : "",
        stripPracticePrefix(currentReviewItem.prompt),
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const completionButtonCount =
    (reviewItemsAvailable ? 1 : 0) + (nextLessonId ? 1 : 0) + 1;
  const completionBackButtonClass =
    completionButtonCount === 1 ? "lessonPrimaryBtn" : "lessonSecondaryBtn";

  const showContinueNextLessonCTA =
    userReady && Boolean(nextLessonAfterLastCompleted) && !canResumeSelected && !practiceActive;

  function updateLocalProgress(lessonIdValue: string, status: string) {
    const now = new Date().toISOString();
    setProgressMap((prev) => ({
      ...prev,
      [lessonIdValue]: {
        userId,
        language,
        lessonId: lessonIdValue,
        status,
        lastActiveAt: now,
      },
    }));
  }


  useEffect(() => {
    if (loading) return;

    if (practiceActive) {
      practiceInputRef.current?.focus();
      return;
    }

    if (session) {
      answerInputRef.current?.focus();
    }
  }, [session, practiceActive, loading, pending]);

  useEffect(() => {
    if (!isClozePrompt) return;
    if (loading || practiceActive || lessonCompleted) return;
    setTimeout(() => {
      clozeInputRef.current?.focus();
    }, 0);
  }, [isClozePrompt, formattedPrompt, loading, practiceActive, lessonCompleted]);

  useEffect(() => {
    setAnswer("");
    setClozeEmptyError(null);
  }, [formattedPrompt]);

  useEffect(() => {
    if (!reviewScreenOpen || loading) return;
    reviewInputRef.current?.focus();
  }, [reviewScreenOpen, reviewIndex, loading]);

  useEffect(() => {
    if (!prefsOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPrefsOpen(false);
    }

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      if (prefsMenuRef.current?.contains(target)) return;
      if (prefsButtonRef.current?.contains(target)) return;

      setPrefsOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [prefsOpen]);

  useEffect(() => {
    if (!showHome) setPrefsOpen(false);
  }, [showHome]);

  useEffect(() => {
    if (!sessionActive) return;
    if (!scrollOnEnterRef.current) return;

    scrollOnEnterRef.current = false;
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "auto" });
      }
      chatEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [sessionActive, messages.length]);

  useEffect(() => {
    if (!showConversation) return;
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "auto" });
      }
      chatEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [showConversation, chatMessages.length, pending]);

  async function refreshSuggestedReview(nextUserId?: string, nextLanguage?: SupportedLanguage) {
    const uid = (nextUserId ?? session?.userId ?? userId).trim();
    const lang = (nextLanguage ?? session?.language ?? language) as SupportedLanguage;
    if (!uid || !lang) {
      setSuggestedReviewItems([]);
      setReviewCandidates([]);
      return;
    }

    let candidates: ReviewCandidateItem[] = [];
    try {
      const candidateRes = await getReviewCandidates({
        userId: uid,
        language: lang,
        maxItems: 5,
      });
      const candidatesRaw = Array.isArray(candidateRes.items) ? candidateRes.items : [];
      candidates = candidatesRaw.filter(
        (item) => typeof item.confidence !== "number" || item.confidence < 0.9
      );
      setReviewCandidates(candidates);
    } catch {
      setReviewCandidates([]);
    }

    let items: SuggestedReviewItem[] = [];
    try {
      const queueRes = await getSuggestedReview({
        userId: uid,
        language: lang,
        maxItems: 5,
      });
      items = Array.isArray(queueRes.items) ? queueRes.items : [];
      setSuggestedReviewItems(items);
      setReviewSummary(queueRes.summary ?? null);
    } catch {
      setSuggestedReviewItems([]);
      setReviewSummary(null);
    }

    if (items.length === 0 && candidates.length > 0) {
      const candidateLessonIds = Array.from(
        new Set(
          candidates
            .map((item) => (typeof item.lessonId === "string" ? item.lessonId.trim() : ""))
            .filter(Boolean)
        )
      ).slice(0, 3);

      try {
        if (candidateLessonIds.length > 0) {
          await Promise.all(
            candidateLessonIds.map((lessonId) =>
              generateReviewQueue({ userId: uid, language: lang, lessonId })
            )
          );
        }

        const refreshedQueue = await getSuggestedReview({
          userId: uid,
          language: lang,
          maxItems: 5,
        });
        items = Array.isArray(refreshedQueue.items) ? refreshedQueue.items : [];
        setSuggestedReviewItems(items);
        setReviewSummary(refreshedQueue.summary ?? null);
      } catch {
        // ignore: keep empty queue
      }
    }

    return { items, candidates };
  }

  async function refreshHomeData(nextUserId?: string, nextLanguage?: SupportedLanguage) {
    const uid = (nextUserId ?? userId).trim();
    const lang = (nextLanguage ?? language) as SupportedLanguage;
    if (!lang) return;

    setHomeDataError(null);

    try {
      const catalogRes = await getLessonCatalog(lang);

      const lessons = Array.isArray(catalogRes.lessons)
        ? catalogRes.lessons.filter(
            (lesson): lesson is LessonCatalogItem =>
              Boolean(lesson && typeof lesson.lessonId === "string" && lesson.lessonId.trim())
          )
        : [];
      setCatalog(lessons);

      if (!uid) {
        setProgressMap({});
        setResumeLessonId(null);
        setLastCompletedLessonId("");
        setHomeDataError(null);
        return;
      }

      const storedLastSessionKey = readLastSessionKey(uid, lang);
      const storedLastSessionStatus = readLastSessionStatus(uid, lang);
      const storedSelectedLessonId = readSelectedLessonId(uid, lang);

      const progressRes = await getUserProgress(uid, lang);
      const progressDocs: ProgressDoc[] = Array.isArray(progressRes.progress)
        ? progressRes.progress
        : [];
      const nextProgressMap: Record<string, ProgressDoc> = {};
      progressDocs.forEach((doc) => {
        if (doc?.lessonId) nextProgressMap[doc.lessonId] = doc;
      });
      setProgressMap(nextProgressMap);

      const inProgressDocs = progressDocs.filter((doc) => doc?.status === "in_progress");
      inProgressDocs.sort((a, b) => {
        const ta = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
        const tb = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
        return tb - ta;
      });
      const resumeId = inProgressDocs[0]?.lessonId ?? null;
      setResumeLessonId(resumeId);

      const completedDocs = progressDocs.filter(
        (doc) => doc && (doc.status === "completed" || doc.status === "needs_review")
      );
      completedDocs.sort((a, b) => {
        const ta = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
        const tb = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
        return tb - ta;
      });
      const lastCompleted = completedDocs[0]?.lessonId ?? "";
      if (lastCompleted) {
        setLastCompletedLessonId(lastCompleted);
        writeLastCompletedLessonId(uid, lang, lastCompleted);
      } else {
        setLastCompletedLessonId("");
      }

      let selectedLessonId = lessonId;

      const sessionKeyParts = storedLastSessionKey.split("|");
      const sessionLessonId =
        sessionKeyParts.length >= 3 &&
        sessionKeyParts[0] === uid &&
        sessionKeyParts[1] === lang
          ? sessionKeyParts[2]
          : "";

      if (resumeId && lessons.some((l) => l.lessonId === resumeId)) {
        selectedLessonId = resumeId;
      } else if (
        storedLastSessionStatus !== "completed" &&
        sessionLessonId &&
        lessons.some((l) => l.lessonId === sessionLessonId)
      ) {
        selectedLessonId = sessionLessonId;
      } else if (
        storedSelectedLessonId &&
        lessons.some((l) => l.lessonId === storedSelectedLessonId)
      ) {
        selectedLessonId = storedSelectedLessonId;
      } else if (lastCompleted) {
        const idx = lessons.findIndex((l) => l.lessonId === lastCompleted);
        const next = idx >= 0 ? lessons[idx + 1]?.lessonId ?? null : null;
        if (next) selectedLessonId = next;
        else if (lessons[0]) selectedLessonId = lessons[0].lessonId;
      } else if (lessons[0]) {
        selectedLessonId = lessons[0].lessonId;
      }

      if (!lessons.length) {
        setLessonId("");
      } else if (selectedLessonId && selectedLessonId !== lessonId) {
        setLessonId(selectedLessonId);
      }
    } catch {
      setHomeDataError("Couldn’t load lessons. Check the server and try again.");
      setCatalog([]);
      setProgressMap({});
      setResumeLessonId(null);
    }
  }

  function stopReview(message?: string) {
    setReviewScreenOpen(false);
    setReviewItems([]);
    setReviewIndex(0);
    setReviewAnswer("");
    setReviewTutorMessage(null);
    setReviewComplete(false);

    if (message) setReviewBanner(message);
  }

  function resetQuickReviewState() {
    setQuickReviewItems([]);
    setQuickReviewIndex(0);
    setQuickReviewAnswer("");
    setQuickReviewTutorMessage(null);
    setQuickReviewResult(null);
    setQuickReviewActive(false);
    setQuickReviewComplete(false);
    setQuickReviewError(null);
  }

  async function beginSuggestedReview() {
    if (practiceActive) return;
    if (!userId.trim()) return;
    let reviewQueue = suggestedReviewItems;
    if (reviewQueue.length === 0) {
      try {
        const candidateLessonIds = Array.from(
          new Set(
            reviewCandidates
              .map((item) => (typeof item.lessonId === "string" ? item.lessonId.trim() : ""))
              .filter(Boolean)
          )
        ).slice(0, 3);

        if (candidateLessonIds.length > 0) {
          await Promise.all(
            candidateLessonIds.map((lessonId) =>
              generateReviewQueue({ userId: userId.trim(), language, lessonId })
            )
          );
        }
      } catch {
        // ignore and fall back to refresh
      }

      const refreshed = await refreshSuggestedReview(userId.trim(), language);
      reviewQueue = refreshed?.items ?? [];
    }
    if (reviewQueue.length === 0) return;

    setReviewDismissed(true);
    setReviewItems(reviewQueue);
    setReviewIndex(0);
    setReviewAnswer("");
    setReviewTutorMessage(null);
    setReviewComplete(false);
    setReviewScreenOpen(true);
  }

  async function startQuickReview() {
    const uid = userId.trim();
    if (!uid || !completedLessonId || loading) return;

    setError(null);
    setQuickReviewError(null);
    setLoading(true);
    setPending("practice");

    try {
      const res = await generateQuickReview({
        userId: uid,
        language,
        lessonId: completedLessonId,
      });

      if (!res.items || res.items.length === 0) {
        setQuickReviewError("Quick review items aren’t available yet.");
        resetQuickReviewState();
        return;
      }

      setQuickReviewItems(res.items);
      setQuickReviewIndex(0);
      setQuickReviewAnswer("");
      setQuickReviewTutorMessage(null);
      setQuickReviewResult(null);
      setQuickReviewComplete(false);
      setQuickReviewActive(true);
    } catch (e: unknown) {
      setQuickReviewError(toUserSafeErrorMessage(e));
      resetQuickReviewState();
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  function dismissQuickReview() {
    if (!completedLessonId) return;
    writeQuickReviewDismissed(language, completedLessonId);
    setQuickReviewDismissed(true);
    resetQuickReviewState();
  }

  async function handleSendQuickReview() {
    if (!currentQuickReviewItem) return;
    const uid = userId.trim();
    if (!uid || loading) return;

    const trimmed = quickReviewAnswer.trim();
    if (!trimmed) {
      setQuickReviewError(quickReviewBlankActive ? "Please type the missing word." : "Please type your answer.");
      return;
    }

    setQuickReviewError(null);
    setLoading(true);
    setPending("practice");

    try {
      const res = await submitPractice({
        userId: uid,
        practiceId: currentQuickReviewItem.id,
        answer: trimmed,
      });

      setQuickReviewTutorMessage(sanitizePracticeTutorMessage(res.tutorMessage));
      setQuickReviewResult(res.result);

      if (quickReviewAutoAdvanceRef.current) {
        window.clearTimeout(quickReviewAutoAdvanceRef.current);
        quickReviewAutoAdvanceRef.current = null;
      }

      if (res.result === "correct") {
        quickReviewAutoAdvanceRef.current = window.setTimeout(() => {
          handleNextQuickReview();
          if (quickReviewAutoAdvanceRef.current) {
            window.clearTimeout(quickReviewAutoAdvanceRef.current);
            quickReviewAutoAdvanceRef.current = null;
          }
        }, 600);
      } else {
        window.setTimeout(() => {
          quickReviewInputRef.current?.focus();
        }, 0);
      }
    } catch (e: unknown) {
      setQuickReviewError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  function handleNextQuickReview() {
    const nextIndex = quickReviewIndex + 1;
    if (nextIndex < quickReviewItems.length) {
      setQuickReviewIndex(nextIndex);
      setQuickReviewAnswer("");
      setQuickReviewTutorMessage(null);
      setQuickReviewResult(null);
      setQuickReviewError(null);
      return;
    }
    setQuickReviewComplete(true);
    setQuickReviewActive(false);
    setQuickReviewTutorMessage(null);
    setQuickReviewResult(null);
    setQuickReviewAnswer("");
    setQuickReviewError(null);
  }

  function toggleUnit(unitKey: string) {
    setOpenUnits((prev) => ({ ...prev, [unitKey]: !prev[unitKey] }));
  }

  function handleChooseAnotherLesson() {
    const target = lessonListRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }

  function handleTargetLanguageChange(nextLanguage: SupportedLanguage) {
    if (!isTargetLanguage(nextLanguage)) return;
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    setError(null);
    setReviewBanner(null);
    setReviewDismissed(false);
    const storedLesson = readSelectedLessonId(userId, nextLanguage);
    setLessonId(storedLesson || "");
  }

  function handleUserGateSave() {
    const next = normalizeUserId(userGateValue);
    if (!next) {
      setUserGateError("Please enter a username.");
      return;
    }
    setUserGateError(null);
    setUserGateValue(next);
    setUserId(next);
  }

  function handleResetUserForTesting() {
    writeUserId("");
    setUserId("");
    setUserGateValue("");
    setUserGateError(null);
    setPrefsOpen(false);
  }

  function handleResetFeedbackGateForTesting() {
    if (!lessonFeedbackContext) return;
    const feedbackDate = getTodayKey();
    clearLessonFeedbackShown(
      lessonFeedbackContext.userId,
      lessonFeedbackContext.language,
      lessonFeedbackContext.lessonId,
      feedbackDate
    );
    setLessonFeedbackOpen(true);
  }

  function handleSaveTesterContext() {
    if (!anonUserId) return;
    if (!testerLevel || !testerGoal) return;
    const next: TesterContext = {
      version: 1,
      selfReportedLevel: testerLevel,
      goal: testerGoal,
      updatedAtISO: new Date().toISOString(),
    };
    saveTesterContext(anonUserId, next);
    setTesterContext(next);
    setShowTesterContext(false);
  }

  function handleDismissTesterContext() {
    if (!anonUserId) return;
    dismissTesterContext(anonUserId, new Date().toISOString());
    setShowTesterContext(false);
  }

  async function startLessonFlow(targetLessonId: string, restart: boolean) {
    const uid = userId.trim();
    if (!uid) return;
    setError(null);
    setForceLessonComplete(false);

    setSession(null);
    setMessages([]);
    setQuestionMeta(null);
    setProgress(null);
    setHintText(null);
    setAnswer("");
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);
    setPracticeResult(null);

    setSuggestedReviewItems([]);
    setReviewSummary(null);
    setReviewCandidates([]);
    setReviewSummary(null);
    setReviewDismissed(false);
    setReviewItems([]);
    setReviewIndex(0);
    setReviewAnswer("");
    setReviewTutorMessage(null);
    setReviewComplete(false);
    setReviewBanner(null);
    setReviewScreenOpen(false);
    setPracticeMode(null);
    setPracticeScreenOpen(false);
    resetQuickReviewState();

    setLoading(true);
    setPending("start");
    scrollOnEnterRef.current = true;

    const normalizedLessonId = targetLessonId.trim();

    try {
      const res = await startLesson({
        userId: uid,
        language,
        lessonId: normalizedLessonId,
        restart,
        teachingPrefs: teachingPrefsPayload,
      });

      setSession(res.session);
      setLessonId(res.session.lessonId);
      const questionMeta = res.question ?? null;
      setMessages(applyQuestionMetaToMessages(res.session.messages ?? [], questionMeta));
      setQuestionMeta(questionMeta);
      setHintText(null);
      setProgress(res.progress ?? null);
      updateLocalProgress(res.session.lessonId, "in_progress");
      setResumeLessonId(res.session.lessonId);

      const key = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;
      setLastSessionKey(key);
      setLastSessionStatus("in_progress");
      writeLastSessionKey(res.session.userId, res.session.language, key);
      writeLastSessionStatus(res.session.userId, res.session.language, "in_progress");

      setPracticeId(null);
      setPracticePrompt(null);
      setPracticeAnswer("");
      setPracticeTutorMessage(null);
      setPracticeAttemptCount(null);
      setPracticeResult(null);
      setPracticeMode(null);
      setPracticeScreenOpen(false);
      void refreshSuggestedReview(res.session.userId, res.session.language);
      void refreshHomeData(res.session.userId, res.session.language);
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  async function handleResumePractice() {
    if (!sessionActive) {
      await handleResume();
    }
    setPracticeScreenOpen(true);
  }

  async function handleStart(overrideLessonId?: string) {
    if (!userId.trim()) return;
    const effectiveLessonId = (overrideLessonId ?? lessonId).trim();
    if (!effectiveLessonId) return;
    const restart = shouldRestartLesson(effectiveLessonId);
    await startLessonFlow(effectiveLessonId, restart);
  }

  async function handleResume() {
    setError(null);

    if (!userId.trim()) return;
    if (!canResumeSelected) return;

    setForceLessonComplete(false);
    setLoading(true);
    setPending("resume");
    scrollOnEnterRef.current = true;

    try {
      const res = await getSession(
        userId.trim(),
        language,
        lessonId.trim() ? lessonId.trim() : undefined
      );
      setSession(res.session);
      setLessonId(res.session.lessonId);
      const questionMeta = res.question ?? null;
      setMessages(applyQuestionMetaToMessages(res.session.messages ?? [], questionMeta));
      setQuestionMeta(questionMeta);
      setProgress(res.progress ?? null);
      setHintText(null);
      setPracticeScreenOpen(false);
      updateLocalProgress(res.session.lessonId, "in_progress");
      setResumeLessonId(res.session.lessonId);

      const key = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;
      setLastSessionKey(key);
      setLastSessionStatus("in_progress");
      writeLastSessionKey(res.session.userId, res.session.language, key);
      writeLastSessionStatus(res.session.userId, res.session.language, "in_progress");

      void refreshSuggestedReview(res.session.userId, res.session.language);
      void refreshHomeData(res.session.userId, res.session.language);
    } catch (e: unknown) {
      const status = getHttpStatus(e);
      if (status === 404) {
        if (lastSessionKey === currentSessionKey) {
          setLastSessionKey("");
          setLastSessionStatus("");
          clearLastSessionKey(userId, language);
          clearLastSessionStatus(userId, language);
        }
        const languageLabel =
          TARGET_LANGUAGES.find((entry) => entry.code === language)?.label ?? language;
        setError(`No session to resume for ${languageLabel} yet.`);
        return;
      } else {
        setError(toUserSafeErrorMessage(e));
      }
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  async function handleRestart() {
    if (!window.confirm("Restart this lesson? Your current progress will be reset.")) return;

    updateLocalProgress(lessonId, "not_started");
    setResumeLessonId(null);

    await startLessonFlow(lessonId, true);
    updateLocalProgress(lessonId, "in_progress");
    setResumeLessonId(lessonId);
    setLastSessionStatus("in_progress");
    writeLastSessionStatus(userId, language, "in_progress");
    void refreshHomeData(userId, language);
  }

  function resetToHome({
    confirm,
    preservePractice,
  }: {
    confirm: boolean;
    preservePractice: boolean;
  }) {
    if (confirm && !window.confirm("Exit this lesson? You can resume later.")) return;

    setError(null);
    setForceLessonComplete(false);
    setSession(null);
    setMessages([]);
    setQuestionMeta(null);
    setProgress(null);
    setHintText(null);
    setAnswer("");

    if (!preservePractice) {
      setPracticeId(null);
      setPracticePrompt(null);
      setPracticeAnswer("");
      setPracticeTutorMessage(null);
      setPracticeAttemptCount(null);
      setPracticeResult(null);
      setPracticeMode(null);
      setPracticeScreenOpen(false);
    } else {
      setPracticeScreenOpen(false);
    }

    setSuggestedReviewItems([]);
    setReviewCandidates([]);
    setReviewDismissed(false);
    setReviewItems([]);
    setReviewIndex(0);
    setReviewAnswer("");
    setReviewTutorMessage(null);
    setReviewComplete(false);
    setReviewBanner(null);
    setReviewScreenOpen(false);
    resetQuickReviewState();

    setPending(null);
    void refreshSuggestedReview();
    void refreshHomeData(userId, language);
  }

  function handleBack() {
    resetToHome({ confirm: false, preservePractice: true });
  }

  function handleAnswerChange(value: string) {
    setAnswer(value);
    if (clozeEmptyError) setClozeEmptyError(null);
  }

  async function handleSendAnswer() {
    if (!session || practiceActive || lessonCompleted) return;
    if (isClozePrompt && !answer.trim()) {
      setClozeEmptyError("Please type the missing word.");
      return;
    }

    setError(null);
    setLoading(true);
    setPending("answer");
    setHintText(null);

    const trimmedAnswer = answer.trim();
    const userMsg: ChatMessage = { role: "user", content: trimmedAnswer };
    setMessages((prev) => [...prev, userMsg]);

    const toSend = trimmedAnswer;
    if (!isClozePrompt) {
      setAnswer("");
    }
    setClozeEmptyError(null);

    const previousStatus = progress?.status ?? "";

    try {
      const res: SubmitAnswerResponse = await submitAnswer({
        userId: session.userId,
        answer: toSend,
        language: session.language,
        lessonId: session.lessonId,
        teachingPrefs: teachingPrefsPayload
      });

      setSession(res.session);
      setProgress(res.progress ?? null);
      const questionMeta = res.question ?? null;
        
      const incomingHint = (res.hint?.text ?? "").trim();
      const isForcedAdvance = res.hint?.level === 3;
        
      let nextMessages = [...(res.session.messages ?? [])];
        
      // On forced advance: split "Next question" into a separate bubble,
      // and insert a reveal card between the two bubbles.
      if (isForcedAdvance && incomingHint) {
        const nextLabel = getNextQuestionLabel(instructionLanguage);
        const lastAssistantIndex = [...nextMessages]
          .map((msg, idx) =>
            msg.role === "assistant" && !(msg.content ?? "").startsWith(REVEAL_PREFIX) ? idx : -1
          )
          .filter((idx) => idx >= 0)
          .slice(-1)[0];

        if (lastAssistantIndex !== undefined) {
          const last = nextMessages[lastAssistantIndex];
          const revealPayload =
            parseRevealParts(incomingHint) ?? { explanation: incomingHint, answer: "" };
          const revealMessage: ChatMessage = {
            role: "assistant",
            content: `${REVEAL_PREFIX}${JSON.stringify(revealPayload)}`,
          };

          const formattedPrompt = questionMeta
            ? formatPromptForTaskType(questionMeta.prompt, questionMeta.taskType)
            : "";

          const labeledParts = splitNextQuestion(last.content);
          const parts =
            labeledParts ||
            (formattedPrompt ? splitPromptFromMessage(last.content, formattedPrompt) : null);

          if (parts) {
            const rebuilt: ChatMessage[] = nextMessages.slice(0, lastAssistantIndex);
            const beforeContent = labeledParts
              ? parts.before
              : stripTrailingNextLabel(parts.before, nextLabel);
            if (beforeContent) rebuilt.push({ ...last, content: beforeContent });
            rebuilt.push(revealMessage);
            rebuilt.push({
              ...last,
              content: labeledParts ? parts.next : `${nextLabel}\n${parts.next}`,
            });
            nextMessages = rebuilt;
          } else {
            nextMessages = [
              ...nextMessages,
              {
                role: "assistant",
                content: `${REVEAL_PREFIX}${JSON.stringify(revealPayload)}`,
              },
            ];
          }
        }
      }

      if (isForcedAdvance && questionMeta?.prompt) {
        const formattedPrompt = formatPromptForTaskType(
          questionMeta.prompt,
          questionMeta.taskType
        );
        const promptNeedle = normalizeCompact(formattedPrompt || questionMeta.prompt);
        const lastAssistant = [...nextMessages]
          .reverse()
          .find((msg) => msg.role === "assistant" && !(msg.content ?? "").startsWith(REVEAL_PREFIX));
        const lastContent = normalizeCompact(lastAssistant?.content ?? "");
        const hasNextQuestionLine = /next question:/i.test(lastAssistant?.content ?? "");
        const hasPrompt = promptNeedle && lastContent.includes(promptNeedle);

        if (!hasNextQuestionLine && !hasPrompt) {
          const nextPrompt = formattedPrompt || questionMeta.prompt;
          const nextLabel = getNextQuestionLabel(instructionLanguage);
          nextMessages.push({
            role: "assistant",
            content: `${nextLabel}\n${nextPrompt}`,
          });
        }
      }

      setMessages(applyQuestionMetaToMessages(nextMessages, questionMeta));
      setQuestionMeta(questionMeta);

      const evalResult = res.evaluation?.result;
      const attemptCount =
        typeof res.session.attempts === "number" ? res.session.attempts : 0;
      const maxAttempts =
        typeof res.session.maxAttempts === "number" ? res.session.maxAttempts : 0;

      if (evalResult === "correct") {
        setFrictionContext(null);
      } else if (evalResult === "wrong" && !isForcedAdvance) {
        const questionIdRaw = questionMeta?.id;
        const questionId = questionIdRaw != null ? String(questionIdRaw) : "";
        const meetsThreshold =
          attemptCount >= 3 || (maxAttempts > 0 && attemptCount >= Math.max(1, maxAttempts - 1));
        const sessionId = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;

        if (questionId && meetsThreshold && !hasFrictionPromptShown(sessionId, questionId)) {
          markFrictionPromptShown(sessionId, questionId);
          setFrictionContext({
            questionId,
            conceptTag: questionMeta?.conceptTag,
            promptStyle: questionMeta?.promptStyle,
            attempts: attemptCount,
            evaluationResult: evalResult,
            reasonCode: res.evaluation?.reasonCode,
          });
        }
      }

      const lastMsg = (res.session.messages ?? []).slice(-1)[0];
      const tutorText =
        lastMsg && lastMsg.role === "assistant" ? lastMsg.content : res.tutorMessage ?? "";
      const tutorLower = tutorText.toLowerCase();

      if (incomingHint) {
        // Forced advance: handled via reveal card insertion
        if (isForcedAdvance) {
          setHintText(null);
        } else if (evalResult !== "correct") {
          const hintLower = incomingHint.toLowerCase();
          if (tutorLower.includes(hintLower)) {
            setHintText(null);
          } else {
            setHintText(incomingHint);
          }
        } else {
          setHintText(null);
        }
      } else {
        setHintText(null);
      }

      if (isForcedAdvance || (evalResult && evalResult !== "correct")) {
        void refreshSuggestedReview(res.session.userId, res.session.language);
      }

      if (res.hint?.level !== 3 && res.practice?.practiceId && res.practice?.prompt) {
        setPracticeId(res.practice.practiceId);
        setPracticePrompt(res.practice.prompt);
        setPracticeAnswer("");
        setPracticeTutorMessage(null);
        setPracticeAttemptCount(null);
        setPracticeResult(null);
        setPracticeMode("lesson");
        setPracticeScreenOpen(false);
      } else if (res.hint?.level === 3) {
        //ensure practice doesnt appear after reveal
        setPracticeId(null);
        setPracticePrompt(null);
        setPracticeAnswer("");
        setPracticeTutorMessage(null);
        setPracticeAttemptCount(null);
        setPracticeResult(null);
        setPracticeMode(null);
        setPracticeScreenOpen(false);
      }

      setProgress(res.progress ?? null);

      const nextStatus = res.progress?.status ?? "";
      const statusChanged = Boolean(nextStatus && nextStatus !== previousStatus);
      const completedNow =
        res.progress?.status === "completed" ||
        res.progress?.status === "needs_review" ||
        res.session?.state === "COMPLETE";

      if (completedNow) {
        const completedStatus = res.progress?.status ?? "completed";
        setForceLessonComplete(true);
        setQuestionMeta(null);
        setAnswer("");
        setClozeEmptyError(null);
        void refreshSuggestedReview(res.session.userId, res.session.language);
        updateLocalProgress(res.session.lessonId, completedStatus);
        if (resumeLessonId === res.session.lessonId) {
          setResumeLessonId(null);
        }
        setLastSessionStatus("completed");
        setLastCompletedLessonId(res.session.lessonId);
        setLastSessionKey("");
        writeLastSessionStatus(res.session.userId, res.session.language, "completed");
        writeLastCompletedLessonId(res.session.userId, res.session.language, res.session.lessonId);
        clearLastSessionKey(res.session.userId, res.session.language);
        const feedbackDate = getTodayKey();
        if (
          !hasLessonFeedbackShown(
            res.session.userId,
            res.session.language,
            res.session.lessonId,
            feedbackDate
          )
        ) {
          markLessonFeedbackShown(
            res.session.userId,
            res.session.language,
            res.session.lessonId,
            feedbackDate
          );
          setLessonFeedbackOpen(true);
        }
        setLessonFeedbackContext({
          userId: res.session.userId,
          lessonId: res.session.lessonId,
          language: res.session.language,
          sessionId: `${res.session.userId}|${res.session.language}|${res.session.lessonId}`,
          instructionLanguage,
          supportLevel,
        });
        if (statusChanged) {
          void refreshHomeData(res.session.userId, res.session.language);
        }
      } else if (res.progress?.status === "in_progress") {
        setForceLessonComplete(false);
        updateLocalProgress(res.session.lessonId, "in_progress");
        setResumeLessonId(res.session.lessonId);
      }
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  async function handleSubmitLessonFeedback(payload: {
    rating?: number;
    quickTags?: LessonFeedbackQuickTag[];
    freeText?: string;
    forcedChoice?: {
      returnTomorrow?: "yes" | "maybe" | "no";
      clarity?: "very_clear" | "mostly_clear" | "somewhat_confusing" | "very_confusing";
      pace?: "too_slow" | "just_right" | "too_fast";
      answerChecking?: "fair" | "mostly_fair" | "unfair" | "not_sure";
    };
  }) {
    if (!lessonFeedbackContext) return;
    const currentTesterContext = testerContext ?? readTesterContext(anonUserId);

    await submitLessonFeedback({
      userId: lessonFeedbackContext.userId,
      targetLanguage: lessonFeedbackContext.language,
      instructionLanguage: lessonFeedbackContext.instructionLanguage,
      lessonId: lessonFeedbackContext.lessonId,
      sessionId: lessonFeedbackContext.sessionId,
      supportLevel: lessonFeedbackContext.supportLevel,
      feedbackType: "lesson_end",
      rating: payload.rating,
      quickTags: payload.quickTags,
      freeText: payload.freeText,
      forcedChoice: payload.forcedChoice,
      testerContext: currentTesterContext ?? undefined,
      createdAt: new Date().toISOString(),
    });
  }

  async function handleSubmitFrictionFeedback(payload: {
    frictionType: "instructions" | "vocab" | "grammar" | "evaluation_unfair" | "other";
    freeText?: string;
  }) {
    const uid = session?.userId ?? userId;
    const lessonLang = session?.language ?? language;
    const lessonIdentifier = session?.lessonId ?? lessonId;
    if (!uid || !lessonLang || !lessonIdentifier || !frictionContext) return;
    const currentTesterContext = testerContext ?? readTesterContext(anonUserId);

    await submitLessonFeedback({
      userId: uid,
      targetLanguage: lessonLang,
      instructionLanguage,
      lessonId: lessonIdentifier,
      sessionId: `${uid}|${lessonLang}|${lessonIdentifier}`,
      supportLevel,
      feedbackType: "friction",
      freeText: payload.freeText,
      forcedChoice: {
        frictionType: payload.frictionType,
      },
      testerContext: currentTesterContext ?? undefined,
      context: {
        questionId: frictionContext.questionId,
        conceptTag: frictionContext.conceptTag,
        attemptsOnQuestion: frictionContext.attempts,
        promptStyle: frictionContext.promptStyle,
        evaluationResult: frictionContext.evaluationResult,
        reasonCode: frictionContext.reasonCode,
      },
      createdAt: new Date().toISOString(),
    });

    setFrictionContext(null);
  }

  async function handleSendPractice() {
    const effectiveUserId = (session?.userId ?? userId).trim();
    if (!practiceId || !effectiveUserId) return;

    setError(null);
    setLoading(true);
    setPending("practice");

    try {
      const res: SubmitPracticeResponse = await submitPractice({
        userId: effectiveUserId,
        practiceId,
        answer: practiceAnswer,
      });

      setPracticeTutorMessage(sanitizePracticeTutorMessage(res.tutorMessage));
      setPracticeAttemptCount(res.attemptCount);
      setPracticeResult(res.result);

      if (res.result === "correct") {
        setPracticeAnswer("");
      } else {
        setPracticeAnswer("");
      }
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  function handlePracticeContinue() {
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);
    setPracticeResult(null);
    setPracticeMode(null);
    setPracticeScreenOpen(false);
  }

  async function handleSubmitReview() {
    const uid = userId.trim();
    if (!uid || !currentReviewItem) return;

    setError(null);
    setLoading(true);
    setPending("review");

    const toSend = reviewAnswer;
    setReviewAnswer("");

    try {
      const res = await submitReview({
        userId: uid,
        language,
        itemId: currentReviewItem.id,
        answer: toSend,
      });

      setReviewTutorMessage(res.tutorMessage);

      if (res.result === "correct") {
        const nextIdx = reviewIndex + 1;
        if (nextIdx < reviewItems.length) {
          setReviewIndex(nextIdx);
          setReviewTutorMessage(null);
        } else {
          setReviewComplete(true);
          setReviewTutorMessage(null);
          void refreshSuggestedReview(uid, language);
        }
      } else {
        if (res.nextItem && res.nextItem.id === currentReviewItem.id) {
          setReviewItems((prev) => {
            const next = [...prev];
            next[reviewIndex] = res.nextItem!;
            return next;
          });
        }
      }
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
      setReviewAnswer(toSend);
    } finally {
      setPending(null);
      setLoading(false);
    }
  }


  return (
    <LessonShell>
      {showHomeContent ? (
        <div
          className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white px-4 py-10"
          data-last-completed={lastCompletedLessonId || undefined}
          data-resume-lesson={resumeLessonId || undefined}
          data-next-lesson={nextLessonId || undefined}
        >
          <div className="mx-auto w-full max-w-[min(1200px,100%)]">
            <div className="rounded-2xl bg-white/90 shadow-lg ring-1 ring-slate-300/60 backdrop-blur p-6 sm:p-8">
              <div className="space-y-6">
                {error && <div className="lessonError">{error}</div>}

                {reviewBanner && (
                  <div className="rounded-2xl border border-slate-300/60 bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200/50">
                    {reviewBanner}
                  </div>
                )}

                <div className="rounded-2xl border border-slate-300/70 bg-white p-5 shadow-sm ring-1 ring-slate-200/50">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <LessonSetupPanel
                      userId={userId}
                      language={language}
                      lessonId={lessonId}
                      lessons={displayCatalog}
                      onUserIdChange={(nextUserId) => setUserId(normalizeUserId(nextUserId))}
                      onLessonChange={setLessonId}
                      languages={TARGET_LANGUAGES}
                      onLanguageChange={handleTargetLanguageChange}
                      disabled={loading || practiceActive}
                    />

                    <div className="lessonPrefsArea self-start lg:self-auto">
                      <button
                        type="button"
                        className="lessonPrefsButton"
                        ref={prefsButtonRef}
                        onClick={() => setPrefsOpen((v) => !v)}
                        aria-expanded={prefsOpen}
                        aria-haspopup="true"
                        title="Teaching preferences"
                      >
                        <img className="lessonPrefsIcon" src={settingsIcon} alt="Settings" />
                      </button>
                      {prefsOpen && (
                        <div className="lessonPrefsMenu" ref={prefsMenuRef}>
                          <label className="lessonPrefsField">
                            <span className="lessonPrefsLabel">Pace</span>
                            <select
                              value={teachingPace}
                              onChange={(e) => setTeachingPace(e.target.value as TeachingPace)}
                              disabled={loading}
                              className="lessonPrefsSelect"
                            >
                              <option value="normal">Normal</option>
                              <option value="slow">Slow</option>
                            </select>
                          </label>

                          <label className="lessonPrefsField">
                            <span className="lessonPrefsLabel">Explanations</span>
                            <select
                              value={explanationDepth}
                              onChange={(e) => setExplanationDepth(e.target.value as ExplanationDepth)}
                              disabled={loading}
                              className="lessonPrefsSelect"
                            >
                              <option value="short">Short</option>
                              <option value="normal">Normal</option>
                              <option value="detailed">Detailed</option>
                            </select>
                          </label>

                          {INSTRUCTION_LANGUAGE_ENABLED && (
                            <label className="lessonPrefsField">
                              <span className="lessonPrefsLabel">Instruction language</span>
                              <select
                                value={instructionLanguage}
                                onChange={(e) =>
                                  setInstructionLanguage(
                                    normalizeInstructionLanguagePreference(e.target.value)
                                  )
                                }
                                disabled={loading}
                                className="lessonPrefsSelect"
                              >
                                <option value="en">English</option>
                                <option value="de" disabled>
                                  German (will be added soon)
                                </option>
                                <option value="es" disabled>
                                  Spanish (will be added soon)
                                </option>
                                <option value="fr" disabled>
                                  French (will be added soon)
                                </option>
                              </select>
                            </label>
                          )}

                          {SUPPORT_LEVEL_ENABLED && (
                            <label className="lessonPrefsField">
                              <span className="lessonPrefsLabel">Support</span>
                              <select
                                value={supportLevel}
                                onChange={(e) => setSupportLevel(normalizeSupportLevel(e.target.value))}
                                disabled={loading}
                                className="lessonPrefsSelect"
                              >
                                <option value="high">High (beginner)</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                              </select>
                            </label>
                          )}

                          {IS_DEV && (
                            <button
                              type="button"
                              className="lessonPrefsAction"
                              onClick={handleResetFeedbackGateForTesting}
                              disabled={!lessonFeedbackContext}
                            >
                              Dev: Reset lesson feedback gate
                            </button>
                          )}

                          {IS_DEV && (
                            <button
                              type="button"
                              className="lessonPrefsAction"
                              onClick={handleResetUserForTesting}
                            >
                              Dev: Reset username
                            </button>
                          )}

                          <button
                            type="button"
                            className="lessonPrefsAction lessonPrefsActionWarm"
                            onClick={() => void handleRestart()}
                            disabled={loading}
                          >
                            Restart lesson
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
                <aside className="space-y-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:pr-1">
                  {showTesterContext && (
                    <div className="rounded-2xl border border-slate-300/70 bg-white p-5 shadow-sm ring-1 ring-slate-200/50">
                      <div className="text-sm font-semibold text-slate-800">
                        Help tailor this pilot (optional)
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Help us tailor lessons to you.
                      </div>
                      <div className="mt-4 space-y-3">
                        <label className="block text-sm text-slate-600">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Your level
                          </span>
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                            value={testerLevel}
                            onChange={(e) =>
                              setTesterLevel(e.target.value as TesterContext["selfReportedLevel"])
                            }
                          >
                            <option value="" disabled>
                              Select a level
                            </option>
                            <option value="A1">A1 beginner</option>
                            <option value="A2">A2 early</option>
                            <option value="B1_PLUS">B1+</option>
                          </select>
                        </label>
                        <label className="block text-sm text-slate-600">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Main goal
                          </span>
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                            value={testerGoal}
                            onChange={(e) =>
                              setTesterGoal(e.target.value as TesterContext["goal"])
                            }
                          >
                            <option value="" disabled>
                              Select a goal
                            </option>
                            <option value="SPEAKING">Speaking confidence</option>
                            <option value="GRAMMAR">Grammar basics</option>
                            <option value="TRAVEL">Travel</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </label>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                          onClick={handleSaveTesterContext}
                          disabled={!testerLevel || !testerGoal}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                          onClick={handleDismissTesterContext}
                        >
                          Not now
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="rounded-2xl border border-blue-200/80 bg-white p-5 shadow-sm ring-1 ring-blue-100/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="mt-0.5 text-xs text-slate-500">
                        {uiStrings.continueWhenReady}
                      </div>
                      {heroStatus && (
                        <Badge className="shrink-0" variant={getBadgeVariant(heroStatus.status)}>
                          {heroStatus.statusLabel}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3">
                      <span className="inline-block rounded-xl border border-blue-200/70 bg-blue-100/60 px-3 py-2 text-lg font-semibold text-blue-900 shadow-sm">
                        {heroLesson?.title || heroLesson?.lessonId || uiStrings.lessonsTitle}
                      </span>
                    </div>

                    {heroConcepts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {heroConcepts.map((chip) => (
                          <Chip key={chip}>{chip}</Chip>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>~6-10 min</span>
                    </div>

                    <button
                      className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                      onClick={() =>
                        canResumeSelected ? void handleResume() : void handleStart()
                      }
                      disabled={primaryActionDisabled}
                    >
                      {heroPrimaryLabel}
                    </button>
                    {userRequiredMessage && (
                      <div className="mt-3 text-sm text-slate-600">{userRequiredMessage}</div>
                    )}
                    <button
                      type="button"
                      className="mt-3 inline-flex text-sm font-medium text-blue-700 hover:text-blue-800"
                      onClick={handleChooseAnotherLesson}
                    >
                      Choose another lesson
                    </button>
                  </div>

                  {showResumePractice && (
                    <div className="rounded-2xl border border-slate-300/70 bg-white p-5 shadow-sm ring-1 ring-slate-200/50">
                      <div className="text-sm text-slate-600">{uiStrings.finishPracticeLabel}</div>
                      <div className="mt-3">
                        <PracticeCard
                          practicePrompt={practicePrompt}
                          practiceId={practiceId}
                          practiceMode={practiceMode}
                          reviewIndex={reviewIndex}
                          reviewQueueLength={reviewItems.length}
                          onStopReview={() => stopReview("Review paused. Continue when you're ready.")}
                          loading={loading}
                          pending={pending}
                          practiceTutorMessage={practiceTutorMessage}
                          practiceAnswer={practiceAnswer}
                          onPracticeAnswerChange={setPracticeAnswer}
                          practiceInputRef={practiceInputRef}
                          canSubmitPractice={canSubmitPractice}
                          onSendPractice={handleSendPractice}
                          practiceResult={practiceResult}
                          onContinue={handlePracticeContinue}
                          uiStrings={uiStrings}
                        />
                      </div>
                      <button
                        className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        onClick={() => void handleResumePractice()}
                        disabled={loading}
                      >
                        {uiStrings.resumePracticeLabel}
                      </button>
                    </div>
                  )}

                  <SuggestedReviewCard
                    visible={showSuggestedReview}
                    items={
                      suggestedReviewItems.length > 0
                        ? suggestedReviewItems
                        : reviewCandidates
                    }
                    loading={loading}
                    onReviewNow={() => void beginSuggestedReview()}
                    onDismiss={() => setReviewDismissed(true)}
                    uiStrings={uiStrings}
                  />

                  <div className="pt-1">
                    <FeedbackCard
                      screen="home"
                      userId={userId}
                      language={language}
                      lessonId={lessonId}
                      sessionKey={feedbackSessionKey || undefined}
                      instructionLanguage={instructionLanguage}
                      currentQuestionIndex={session?.currentQuestionIndex ?? undefined}
                      disabled={loading}
                      triggerLabel="Optional feedback"
                      triggerClassName="inline-flex text-sm font-medium text-slate-600 hover:text-slate-800"
                    />
                  </div>
                </aside>

                <section
                  className="space-y-4"
                  ref={lessonListRef}
                  tabIndex={-1}
                  aria-label="Lesson list"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-base font-semibold text-slate-900">
                        {uiStrings.lessonsTitle}
                      </div>
                      {showContinueNextLessonCTA && nextLessonAfterLastCompleted && (
                        <button
                          className="rounded-xl border border-slate-300/70 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                          onClick={() => void handleStart(nextLessonAfterLastCompleted)}
                          disabled={loading}
                          title={`Continue to ${nextLessonAfterLastCompleted}`}
                        >
                          {uiStrings.continueNextLesson}
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-slate-500">{uiStrings.continueWhenReady}</div>
                  </div>

                  {homeDataError && (
                    <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4 text-sm text-slate-700 shadow-sm ring-1 ring-amber-100/60">
                      <div>{homeDataError}</div>
                      <button
                        type="button"
                        className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                        onClick={() => void refreshHomeData()}
                        disabled={busy}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <div className="mt-4 space-y-4">
                    {lessonUnits.map((unit, idx) => {
                      const isOpen = openUnits[unit.key] ?? idx === 0;
                      const panelId = `unit-panel-${unit.key}`;
                      return (
                        <div key={unit.key} className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm ring-1 ring-slate-200/60 sm:p-5">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-4 border-b border-slate-200/70 pb-3"
                            onClick={() => toggleUnit(unit.key)}
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                          >
                            <div className="text-left">
                              <div className="text-xs font-semibold tracking-wide text-slate-500">
                                {`Unit ${idx + 1}`}
                              </div>
                              <div className="mt-0.5 text-sm font-semibold text-slate-900">
                                {unit.label}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <span>{unit.lessons.length} lessons</span>
                              <span className={cn("transition", isOpen ? "rotate-180" : "")}>▾</span>
                            </div>
                          </button>

                          <div
                            id={panelId}
                            className={cn(
                              "overflow-hidden transition-all duration-200 ease-out",
                              isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                            )}
                          >
                            <div className="mt-4 space-y-3">
                              {unit.lessons.map((lesson) => {
                                if (!lesson?.lessonId) return null;
                                const { status, statusLabel, accent } = getLessonStatusInfo(
                                  lesson.lessonId
                                );
                                const selected = lesson.lessonId === lessonId;
                                const isCompact = status === "completed";
                                const conceptChips = getLessonConcepts(lesson.lessonId).slice(0, 3);
                                const lessonReviewAvailable = suggestedReviewItems.some(
                                  (item) => item.lessonId === lesson.lessonId
                                );
                                return (
                                  <div
                                    key={lesson.lessonId}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      "rounded-xl border border-slate-300/70 bg-slate-50/80 p-4 shadow-sm transition-colors hover:bg-slate-100/70",
                                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200",
                                      selected ? "ring-2 ring-blue-200" : ""
                                    )}
                                    onClick={() => setLessonId(lesson.lessonId)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setLessonId(lesson.lessonId);
                                      }
                                    }}
                                    style={{ borderLeftWidth: 4, borderLeftColor: accent }}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="text-sm font-semibold text-slate-900">
                                        {lesson.title || lesson.lessonId}
                                      </div>
                                      <Badge className="shrink-0" variant={getBadgeVariant(status)}>
                                        {statusLabel}
                                      </Badge>
                                    </div>
                                    {!isCompact && (
                                      <div className="mt-1 text-sm text-slate-600">
                                        {lesson.description || uiStrings.continueWhenReady}
                                      </div>
                                    )}
                                    {!isCompact && conceptChips.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {conceptChips.map((chip) => (
                                          <Chip key={chip}>{chip}</Chip>
                                        ))}
                                      </div>
                                    )}
                                    {isCompact && lessonReviewAvailable && (
                                      <button
                                        type="button"
                                        className="mt-2 text-sm font-medium text-blue-700 hover:text-blue-800"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void beginSuggestedReview();
                                        }}
                                      >
                                        Review
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {lessonUnits.length === 0 && (
                      <div className="text-sm text-slate-500">{emptyLessonsMessage}</div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : showReviewScreen ? (
        <div className="lessonPracticeScreen">
          {error && <div className="lessonError">{error}</div>}
          <div className="lessonPracticeHeader">
            <button className="lessonSecondaryBtn" onClick={handleBack}>
              {uiStrings.backToLessons}
            </button>
            <div className="lessonPracticeTitle">{uiStrings.reviewLabel}</div>
          </div>
          <div className="lessonPracticeCue review">{uiStrings.optionalReviewLabel}</div>
          <div className="lessonPracticePanel">
            <div className="lessonReviewCard">
              {!reviewComplete && currentReviewItem ? (
                <>
                  <div className="lessonReviewHeader">
                      <div className="lessonReviewStep">
                      {uiStrings.reviewLabel} {Math.min(reviewIndex + 1, Math.max(1, reviewItems.length))}/
                      {Math.max(1, reviewItems.length)}
                    </div>
                    <button
                      type="button"
                      className="lessonSecondaryBtn"
                      onClick={() => stopReview("Review paused. Continue when you're ready.")}
                      disabled={loading}
                    >
                      {uiStrings.stopLabel}
                    </button>
                  </div>

                  <div className="lessonReviewPrompt">
                    <div className="lessonReviewLabel">{uiStrings.tutorLabel}</div>
                    <div className="lessonReviewPromptBubble">
                      {reviewPromptText}
                    </div>
                  </div>

                  {pending === "review" && (
                    <div className="lessonReviewTyping">
                      <div className="lessonReviewDots">
                        <span className="typingDot" />
                        <span className="typingDot" />
                        <span className="typingDot" />
                      </div>
                    </div>
                  )}

                  {reviewTutorMessage && (
                    <div className="lessonReviewFeedback">
                      <div className="lessonReviewMessage">{reviewTutorMessage}</div>
                    </div>
                  )}

                  <div className="lessonReviewInputRow">
                    <input
                      ref={reviewInputRef}
                      value={reviewAnswer}
                      onChange={(e) => setReviewAnswer(e.target.value)}
                      placeholder={uiStrings.reviewPlaceholder}
                      className="lessonReviewInput"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canSubmitReview) void handleSubmitReview();
                      }}
                    />
                    <button
                      type="button"
                      className="lessonPrimaryBtn"
                      onClick={() => void handleSubmitReview()}
                      disabled={!canSubmitReview}
                    >
                      {uiStrings.sendLabel}
                    </button>
                  </div>
                </>
            ) : reviewItems.length === 0 ? (
              <div className="lessonReviewComplete">
                <div className="lessonReviewCompleteTitle">
                  {uiStrings.noReviewItemsLabel}
                </div>
                <button type="button" className="lessonPrimaryBtn" onClick={handleBack}>
                  {uiStrings.backToLessons}
                </button>
              </div>
            ) : (
                <div className="lessonReviewComplete">
                  <div className="lessonReviewCompleteTitle">
                    {uiStrings.reviewCompleteLabel}
                  </div>
                  <button type="button" className="lessonPrimaryBtn" onClick={handleBack}>
                    {uiStrings.backToLessons}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : showHome ? null : (
        <>
          {session && (
            <SessionHeader
              session={session}
              progress={progress}
              loading={loading}
              lessonTitle={currentLessonMeta?.title}
              lessonDescription={currentLessonMeta?.description}
              onBack={showPracticeScreen ? () => setPracticeScreenOpen(false) : handleBack}
              uiStrings={uiStrings}
            />
          )}

          {showPracticeScreen && (
            <div className="lessonPracticeScreen">
              {!session && (
                <div className="lessonPracticeHeader">
                  <button
                    className="lessonSecondaryBtn"
                    onClick={handleBack}
                  >
                    {uiStrings.backLabel}
                  </button>
                  <div className="lessonPracticeTitle">
                    {isReviewPractice ? uiStrings.reviewPracticeTitle : uiStrings.practiceLabel}
                  </div>
                </div>
              )}

              <div
                className={`lessonPracticeCue ${
                  isReviewPractice ? "review" : "required"
                }`}
              >
                {isReviewPractice
                  ? uiStrings.optionalReviewLabel
                  : uiStrings.practiceRequiredLabel}
              </div>

              <div className="lessonPracticePanel">
                <PracticeCard
                  practicePrompt={practicePrompt}
                  practiceId={practiceId}
                  practiceMode={practiceMode}
                  reviewIndex={reviewIndex}
                  reviewQueueLength={reviewItems.length}
                  onStopReview={() => stopReview("Review paused. Continue the lesson when you're ready.")}
                  loading={loading}
                  pending={pending}
                  practiceTutorMessage={practiceTutorMessage}
                  practiceAnswer={practiceAnswer}
                  onPracticeAnswerChange={setPracticeAnswer}
                  practiceInputRef={practiceInputRef}
                  canSubmitPractice={canSubmitPractice}
                  onSendPractice={handleSendPractice}
                  practiceResult={practiceResult}
                  onContinue={handlePracticeContinue}
                  uiStrings={uiStrings}
                />
              </div>
            </div>
          )}

          {showConversation && (
            <>
          <div className={sessionActive && !practiceScreenOpen ? "pb-28" : ""}>
          <ChatPane
            chatRef={chatRef}
            chatEndRef={chatEndRef}
            messages={chatMessages}
            session={session}
            pending={pending}
            showEmptyState={!practiceActive}
            uiStrings={uiStrings}
            instructionLanguage={instructionLanguage}
            clozeActive={isClozePrompt && !lessonCompleted}
            clozePrompt={lessonCompleted ? "" : formattedPrompt}
            clozeValue={answer}
            onClozeChange={handleAnswerChange}
            onClozeSubmit={handleSendAnswer}
            clozeDisabled={!sessionActive || loading || practiceActive || lessonCompleted}
            clozeInputRef={clozeInputRef}
            clozeHelperText={isClozePrompt && !lessonCompleted ? clozeHelperText : ""}
            clozeErrorText={clozeEmptyError ?? ""}
          >
                {practiceActive && practiceMode === "lesson" && (
                  <div className="lessonPracticeInline">
                    <PracticeCard
                      practicePrompt={practicePrompt}
                      practiceId={practiceId}
                      practiceMode={practiceMode}
                      reviewIndex={reviewIndex}
                      reviewQueueLength={reviewItems.length}
                      onStopReview={() => stopReview("Review paused. Continue the lesson when you're ready.")}
                      loading={loading}
                      pending={pending}
                      practiceTutorMessage={practiceTutorMessage}
                      practiceAnswer={practiceAnswer}
                      onPracticeAnswerChange={setPracticeAnswer}
                          practiceInputRef={practiceInputRef}
                          canSubmitPractice={canSubmitPractice}
                          onSendPractice={handleSendPractice}
                          practiceResult={practiceResult}
                          onContinue={handlePracticeContinue}
                          uiStrings={uiStrings}
                        />
                  </div>
                )}
                {!practiceActive && !lessonCompleted && frictionContext && (
                  <FrictionFeedback
                    visible
                    onSend={handleSubmitFrictionFeedback}
                    onDismiss={() => setFrictionContext(null)}
                  />
                )}
                {lessonCompleted && !practiceActive && (
                  <>
                    <div className="lessonCompletionCard">
                      <div className="lessonCompletionTitle">{uiStrings.lessonCompleteTitle}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {uiStrings.lessonCompleteSubtitle}
                      </div>
                      <div className="lessonCompletionSummary">
                        {reviewFocusNext.length > 0 && (
                          <div className="lessonCompletionBlock">
                            <div className="lessonCompletionLabel">{uiStrings.focusNextLabel}</div>
                            <ul className="lessonCompletionList">
                              {reviewFocusNext.map((item, idx) => (
                                <li key={`${item}-${idx}`}>{item.replace(/_/g, " ")}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {showQuickReviewCard && (
                        <Card className="mt-4 border-slate-200 bg-white p-5 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                Quick review (optional)
                              </div>
                              <div className="mt-1 text-sm text-slate-600">
                                30–60 seconds to reinforce what you just practiced.
                              </div>
                            </div>
                            {quickReviewActive && (
                              <div className="text-xs text-slate-500">
                                {Math.min(quickReviewIndex + 1, Math.max(1, quickReviewItems.length))}/
                                {Math.max(1, quickReviewItems.length)}
                              </div>
                            )}
                          </div>

                          {!quickReviewActive && !quickReviewComplete && (
                            <div className="mt-4 flex flex-wrap gap-3">
                              <Button onClick={() => void startQuickReview()} disabled={loading}>
                                Start quick review
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={dismissQuickReview}
                                disabled={loading}
                              >
                                Not now
                              </Button>
                            </div>
                          )}

                          {quickReviewActive && currentQuickReviewItem && (
                            <div className="mt-4 space-y-3">
                              <div className="text-sm text-slate-800">
                                {quickReviewBlankActive && quickReviewPrompt.includes("___") ? (
                                  <span className="inline-flex flex-wrap items-center">
                                    <span>{quickReviewPromptBefore}</span>
                                    <input
                                      ref={quickReviewInputRef}
                                      value={quickReviewAnswer}
                                      onChange={(e) => setQuickReviewAnswer(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && quickReviewCanSubmit) {
                                          e.preventDefault();
                                          void handleSendQuickReview();
                                        }
                                      }}
                                      disabled={quickReviewInputDisabled}
                                      className="mx-2 inline-block w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                                    />
                                    <span>{quickReviewPromptAfter}</span>
                                  </span>
                                ) : (
                                  <div>
                                    <div className="whitespace-pre-wrap">{quickReviewPrompt}</div>
                                    <input
                                      ref={quickReviewInputRef}
                                      value={quickReviewAnswer}
                                      onChange={(e) => setQuickReviewAnswer(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && quickReviewCanSubmit) {
                                          e.preventDefault();
                                          void handleSendQuickReview();
                                        }
                                      }}
                                      disabled={quickReviewInputDisabled}
                                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                                    />
                                  </div>
                                )}
                              </div>
                              {quickReviewBlankActive && (
                                <div className="text-sm text-slate-600">Type the missing word.</div>
                              )}
                              {quickReviewError && (
                                <div className="text-sm text-rose-600">{quickReviewError}</div>
                              )}
                              {quickReviewTutorMessage && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                  {quickReviewTutorMessage}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-3">
                                {quickReviewResult !== "correct" ? (
                                  <Button
                                    onClick={() => void handleSendQuickReview()}
                                    disabled={!quickReviewCanSubmit}
                                  >
                                    {uiStrings.sendLabel ?? "Send"}
                                  </Button>
                                ) : (
                                  <Button variant="secondary" onClick={handleNextQuickReview}>
                                    {quickReviewIndex + 1 < quickReviewItems.length
                                      ? "Next"
                                      : "Finish"}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}

                          {quickReviewComplete && (
                            <div className="mt-4 text-sm text-slate-700">Done. Nice work.</div>
                          )}
                        </Card>
                      )}

                      <div className="lessonCompletionActions">
                        {reviewItemsAvailable && (
                          <button
                            className="lessonSecondaryBtn"
                            onClick={() => beginSuggestedReview()}
                            disabled={loading}
                          >
                            {uiStrings.reviewOptionalButton}
                          </button>
                        )}
                        {nextLessonId && (
                          <button
                            className="lessonPrimaryBtn"
                            onClick={() => void handleStart(nextLessonId)}
                            disabled={loading}
                          >
                            {uiStrings.continueNextLesson}
                          </button>
                        )}
                        <button
                          className={completionBackButtonClass}
                          onClick={handleBack}
                          disabled={loading}
                        >
                          {uiStrings.backToLessons}
                        </button>
                      </div>

                      {!nextLessonId && (
                        <div className="lessonCompletionNote">
                          {uiStrings.noNextLessonNote}
                        </div>
                      )}
                    </div>

                </>
                )}
              </ChatPane>
              </div>
            </>
          )}

          {sessionActive && !practiceScreenOpen && (
            <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur">
              <div className="mx-auto w-full max-w-[min(1200px,100%)] px-4 pb-3">
                <AnswerBar
                  answer={answer}
                  onAnswerChange={handleAnswerChange}
                  answerInputRef={answerInputRef}
                  canSubmitAnswer={canSubmitAnswer}
                  onSendAnswer={handleSendAnswer}
                  sessionActive={sessionActive}
                  loading={loading}
                  practiceActive={practiceActive}
                  lessonCompleted={lessonCompleted}
                  hideInput={isClozePrompt}
                  helperText=""
                  errorText=""
                  uiStrings={uiStrings}
                />
              </div>
            </div>
          )}
        </>
      )}
      {!userReady && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Enter username"
          >
            <div className="text-center">
              <div className="text-lg font-semibold text-slate-900">
                Welcome to AI Language Tutor
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Please enter a username to get started.
              </div>
            </div>
            <input
              ref={userGateInputRef}
              className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={userGateValue}
              onChange={(e) => {
                setUserGateValue(e.target.value);
                if (userGateError) setUserGateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleUserGateSave();
                }
              }}
              placeholder="Your username"
              autoComplete="username"
            />
            {userGateError && (
              <div className="mt-2 text-sm text-rose-600">{userGateError}</div>
            )}
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              onClick={handleUserGateSave}
              disabled={!userGateValue.trim()}
            >
              Save and continue
            </button>
          </div>
        </div>
      )}
      <LessonFeedbackModal
        open={lessonFeedbackOpen}
        onClose={() => setLessonFeedbackOpen(false)}
        onSubmit={handleSubmitLessonFeedback}
      />
    </LessonShell>
  );
}
