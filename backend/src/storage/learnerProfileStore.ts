// backend/src/storage/learnerProfileStore.ts

import mongoose from "mongoose";
import { LearnerProfileModel } from "../state/learnerProfileState";
import type { EvalResult, ReasonCode } from "../state/answerEvaluator";
import { SupportedLanguage } from "../types";
import {
  normalizeLanguage as normalizeInstructionLanguage,
} from "../utils/instructionLanguage";

function isMongoReady(): boolean {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  // We skip writes unless connected to avoid buffering/hanging in tests.
  return mongoose.connection.readyState === 1;
}

function safeReasonKey(reasonCode: unknown): string | null {
  if (typeof reasonCode !== "string") return null;
  const t = reasonCode.trim().toUpperCase();
  if (!t) return null;

  // Protect against Mongo dot-path separators.
  return t.replace(/[.$]/g, "_");
}

function safeConceptKey(raw: string | undefined): string {
  const t = (raw || "").trim().toLowerCase();
  if (!t) return "";
  return t.replace(/[.$]/g, "_").replace(/\s+/g, "_").slice(0, 48);
}

function isHumanConceptLabel(key: string): boolean {
  // Keep only simple human tags like "greetings", "articles", "word_order"
  return /^[a-z][a-z0-9_]{2,47}$/.test(key);
}

export type TeachingPace = "slow" | "normal";
export type TeachingExplanationDepth = "short" | "normal" | "detailed";

export type TeachingProfilePrefs = {
  pace: TeachingPace;
  explanationDepth: TeachingExplanationDepth;
};

function toPace(v: unknown): TeachingPace | undefined {
  return v === "slow" || v === "normal" ? v : undefined;
}

function toExplanationDepth(v: unknown): TeachingExplanationDepth | undefined {
  return v === "short" || v === "normal" || v === "detailed" ? v : undefined;
}

const DEFAULT_INSTRUCTION_LANGUAGE: SupportedLanguage = "en";

export async function updateTeachingProfilePrefs(args: {
  userId: string;
  language: SupportedLanguage;
  pace?: unknown;
  explanationDepth?: unknown;
}): Promise<void> {
  if (!isMongoReady()) return;

  const pace = toPace(args.pace);
  const explanationDepth = toExplanationDepth(args.explanationDepth);

  if (!pace && !explanationDepth) return;

  const set: Record<string, unknown> = { lastActiveAt: new Date() };
  if (pace) set.pace = pace;
  if (explanationDepth) set.explanationDepth = explanationDepth;

  await LearnerProfileModel.updateOne(
    { userId: args.userId, language: args.language },
    {
      $setOnInsert: { userId: args.userId, language: args.language },
      $set: set,
    },
    { upsert: true }
  );
}

export async function getInstructionLanguage(
  userId: string,
  language: SupportedLanguage
): Promise<SupportedLanguage> {
  if (!isMongoReady()) return DEFAULT_INSTRUCTION_LANGUAGE;

  const doc = (await LearnerProfileModel.findOne(
    { userId, language },
    { instructionLanguage: 1 }
  ).lean()) as Record<string, unknown> | null;

  if (!doc) return DEFAULT_INSTRUCTION_LANGUAGE;

  const raw = (doc as any).instructionLanguage;
  return normalizeInstructionLanguage(raw) ?? DEFAULT_INSTRUCTION_LANGUAGE;
}

export async function setInstructionLanguage(args: {
  userId: string;
  language: SupportedLanguage;
  instructionLanguage?: unknown;
}): Promise<void> {
  if (!isMongoReady()) return;

  const normalized = normalizeInstructionLanguage(args.instructionLanguage);
  if (!normalized) return;

  await LearnerProfileModel.updateOne(
    { userId: args.userId, language: args.language },
    {
      $setOnInsert: { userId: args.userId, language: args.language },
      $set: { instructionLanguage: normalized, lastActiveAt: new Date() },
    },
    { upsert: true }
  );
}

function mistakeTagFromReasonCode(reasonCode: unknown): string | null {
  const c = typeof reasonCode === "string" ? reasonCode.trim().toUpperCase() : "";
  if (!c) return null;

  if (c === "ARTICLE") return "articles";
  if (c === "WORD_ORDER") return "word_order";
  if (c === "TYPO") return "typos";
  if (c === "WRONG_LANGUAGE") return "wrong_language";
  if (c === "MISSING_SLOT") return "missing_slot";
  if (c === "OTHER") return "general";
  return "general";
}

type RecordLessonAttemptArgs = {
  userId: string;
  language: string;
  result: EvalResult;
  reasonCode?: ReasonCode;
  forcedAdvance: boolean;
  repeatedWrong?: boolean;
  conceptTag?: string;
  lessonId?: string;
  questionId?: string;
};

type RecordPracticeAttemptArgs = {
  userId: string;
  language: string;
  result: EvalResult;
  reasonCode?: ReasonCode;
  conceptTag?: string;
};

// Phase 7.4: Review items are keyed as object paths (reviewItems.<key>...) in Mongo.
// Keep the key path-safe (no dots, no leading $) and stable.
function makeReviewKey(lessonId: string, questionId: string | number): string {
  const raw = `${lessonId}__q${String(questionId)}`;
  // Replace anything that could break Mongo dot-notation paths.
  const safe = raw.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return safe.startsWith("$") ? `_${safe}` : safe;
}

function parseReviewKey(key: string): { lessonId: string; questionId: string } | null {
  const idx = key.indexOf("__");
  if (idx <= 0 || idx >= key.length - 1) return null;
  const lessonId = key.slice(0, idx).trim();
  let questionId = key.slice(idx + 2).trim();
  if (!lessonId || !questionId) return null;
  if (questionId.startsWith("q")) questionId = questionId.slice(1);
  if (!questionId) return null;
  return { lessonId, questionId };
}

const MAX_REVIEW_ITEMS = 120;
const MAX_REVIEW_MISTAKES = 20;

type ReviewOutcome = "correct" | "almost" | "wrong" | "forced_advance";

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeOutcome(value: unknown): ReviewOutcome {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v === "correct" || v === "almost" || v === "wrong" || v === "forced_advance") return v;
  return "wrong";
}

function outcomeConfidence(outcome: ReviewOutcome): number {
  if (outcome === "almost") return 0.55;
  if (outcome === "wrong") return 0.35;
  if (outcome === "forced_advance") return 0.2;
  return 0.6;
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const d = new Date(value as any);
  return Number.isFinite(d.getTime()) ? d : null;
}

type ReviewItemRecord = {
  lessonId: string;
  questionId: string;
  conceptTag: string;
  lastSeenAt: Date;
  lastReviewedAt?: Date;
  lastOutcome: ReviewOutcome;
  mistakeCount: number;
  confidence: number;
  lastResult?: string;
  wrongCount?: number;
  forcedAdvanceCount?: number;
};

function normalizeReviewItems(raw: unknown): { items: Record<string, ReviewItemRecord>; changed: boolean } {
  let changed = false;
  const entries: Array<[string, ReviewItemRecord, number]> = [];

  const iterable =
    raw instanceof Map ? Array.from(raw.entries()) : typeof raw === "object" && raw ? Object.entries(raw as any) : [];

  for (const [key, value] of iterable) {
    if (typeof key !== "string" || !key) {
      changed = true;
      continue;
    }

    let lessonId = typeof (value as any)?.lessonId === "string" ? (value as any).lessonId.trim() : "";
    let questionId = typeof (value as any)?.questionId === "string" ? (value as any).questionId.trim() : "";
    if ((!lessonId || !questionId) && typeof key === "string") {
      const parsed = parseReviewKey(key);
      if (parsed) {
        if (!lessonId) {
          lessonId = parsed.lessonId;
          changed = true;
        }
        if (!questionId) {
          questionId = parsed.questionId;
          changed = true;
        }
      }
    }
    if (questionId.startsWith("q")) {
      questionId = questionId.slice(1);
      changed = true;
    }
    if (!lessonId || !questionId) {
      changed = true;
      continue;
    }

    let conceptTag = typeof (value as any)?.conceptTag === "string" ? safeConceptKey((value as any).conceptTag) : "";
    if (conceptTag && !isHumanConceptLabel(conceptTag)) {
      conceptTag = "";
      changed = true;
    }

    const lastSeenAt = coerceDate((value as any)?.lastSeenAt);
    if (!lastSeenAt) {
      changed = true;
      continue;
    }

    const rawOutcome = (value as any)?.lastOutcome ?? (value as any)?.lastResult;
    const lastOutcome = normalizeOutcome(rawOutcome);

    const mistakeRaw =
      typeof (value as any)?.mistakeCount === "number"
        ? (value as any).mistakeCount
        : (value as any)?.wrongCount ?? 0;
    const mistakeCount = clampInt(mistakeRaw, 0, 0, MAX_REVIEW_MISTAKES);
    if (mistakeCount !== mistakeRaw) changed = true;

    const confidenceRaw = (value as any)?.confidence;
    const confidence = clampNumber(confidenceRaw, outcomeConfidence(lastOutcome), 0, 1);
    if (typeof confidenceRaw !== "number" || confidence !== confidenceRaw) changed = true;

    const record: ReviewItemRecord = {
      lessonId,
      questionId,
      conceptTag,
      lastSeenAt,
      lastOutcome,
      mistakeCount,
      confidence,
    };

    const lastReviewedAt = coerceDate((value as any)?.lastReviewedAt);
    if (lastReviewedAt) record.lastReviewedAt = lastReviewedAt;

    if (typeof (value as any)?.lastResult === "string") record.lastResult = (value as any).lastResult;
    if (typeof (value as any)?.wrongCount === "number") record.wrongCount = (value as any).wrongCount;
    if (typeof (value as any)?.forcedAdvanceCount === "number")
      record.forcedAdvanceCount = (value as any).forcedAdvanceCount;

    entries.push([key, record, lastSeenAt.getTime()]);
  }

  entries.sort((a, b) => b[2] - a[2]);
  if (entries.length > MAX_REVIEW_ITEMS) {
    entries.length = MAX_REVIEW_ITEMS;
    changed = true;
  }

  const out: Record<string, ReviewItemRecord> = {};
  for (const [key, record] of entries) {
    out[key] = record;
  }

  return { items: out, changed };
}

async function normalizeReviewItemsForProfile(userId: string, language: string): Promise<void> {
  if (!isMongoReady()) return;

  const doc: any = await LearnerProfileModel.findOne({ userId, language }, { reviewItems: 1 }).lean();
  if (!doc?.reviewItems) return;

  const { items, changed } = normalizeReviewItems(doc.reviewItems);
  if (!changed) return;

  await LearnerProfileModel.updateOne(
    { userId, language },
    { $set: { reviewItems: items } }
  );
}

export async function recordLessonAttempt(args: RecordLessonAttemptArgs): Promise<void> {
  if (!isMongoReady()) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[review] mongo not ready; skipping recordLessonAttempt", {
        userId: args.userId,
        language: args.language,
      });
    }
    return;
  }

  const reasonKey = args.result !== "correct" ? safeReasonKey(args.reasonCode) : null;
  const conceptKey = safeConceptKey(args.conceptTag);

  const inc: Record<string, number> = { attemptsTotal: 1 };
  if (args.forcedAdvance) inc.forcedAdvanceCount = 1;

  if (reasonKey) inc[`mistakeCountsByReason.${reasonKey}`] = 1;
  if (conceptKey && isHumanConceptLabel(conceptKey)) inc[`mistakeCountsByConcept.${conceptKey}`] = 1;

  type PushOps = {
    topMistakeTags?: { $each: string[]; $slice: number };
    recentConfusions?: { $each: Array<{ conceptTag: string; timestamp: Date }>; $slice: number };
  };

  const now = new Date();

  const push: PushOps = {};

  const set: Record<string, any> = { lastActiveAt: now };

  if (args.result !== "correct") {
    const mistakeTag = mistakeTagFromReasonCode(args.reasonCode);
    if (mistakeTag) {
      push.topMistakeTags = { $each: [mistakeTag], $slice: -12 };
    }

    if (conceptKey && isHumanConceptLabel(conceptKey)) {
      push.recentConfusions = {
        $each: [{ conceptTag: conceptKey, timestamp: now }],
        $slice: -12,
      };
    }

    const shouldRecordReview =
      args.forcedAdvance || args.result === "almost" || Boolean(args.repeatedWrong);

    // Phase 7.4: track a bounded, privacy-safe review candidate for calm spaced repetition.
    // Only capture when we have enough identifiers to safely find the question again later.
    if (
      shouldRecordReview &&
      typeof args.lessonId === "string" &&
      args.lessonId.trim() &&
      args.questionId != null
    ) {
      const qid = String(args.questionId ?? "").trim();
      const lessonId = args.lessonId.trim();
      if (qid) {
        const reviewKey = makeReviewKey(lessonId, qid);
        const lastOutcome: ReviewOutcome = args.forcedAdvance
          ? "forced_advance"
          : normalizeOutcome(args.result);

        set[`reviewItems.${reviewKey}.lessonId`] = lessonId;
        set[`reviewItems.${reviewKey}.questionId`] = qid;
        set[`reviewItems.${reviewKey}.conceptTag`] =
          conceptKey && isHumanConceptLabel(conceptKey) ? conceptKey : "";
        set[`reviewItems.${reviewKey}.lastSeenAt`] = now;
        set[`reviewItems.${reviewKey}.lastOutcome`] = lastOutcome;
        set[`reviewItems.${reviewKey}.lastResult`] = args.result;

        // Track intensity by wrong/almost occurrences. We never pressure with streaks.
        inc[`reviewItems.${reviewKey}.mistakeCount`] = 1;
        inc[`reviewItems.${reviewKey}.wrongCount`] = 1;

        if (args.forcedAdvance) {
          inc[`reviewItems.${reviewKey}.forcedAdvanceCount`] = 1;
        }
      }
    }
  }

  await LearnerProfileModel.updateOne(
    { userId: args.userId, language: args.language },
    {
      $setOnInsert: { userId: args.userId, language: args.language },
      $set: set,
      $inc: inc,
      ...(Object.keys(push).length ? { $push: push } : {}),
    },
    { upsert: true }
  );

  if (args.result !== "correct") {
    const shouldRecordReview =
      args.forcedAdvance || args.result === "almost" || Boolean(args.repeatedWrong);
    if (shouldRecordReview) {
      try {
        await normalizeReviewItemsForProfile(args.userId, args.language);
      } catch {
        // best-effort: don't block lesson flow
      }
    }
  }
}

export async function recordReviewPracticeOutcome(args: {
  userId: string;
  language: string;
  lessonId: string;
  questionId: string;
  result: EvalResult;
  conceptTag?: string;
}): Promise<void> {
  if (!isMongoReady()) return;

  const lessonId = typeof args.lessonId === "string" ? args.lessonId.trim() : "";
  const qid = typeof args.questionId === "string" ? args.questionId.trim() : "";
  if (!lessonId || !qid) return;

  const reviewKey = makeReviewKey(lessonId, qid);
  const now = new Date();

  let currentConfidence = 0.5;
  try {
    const doc: any = await LearnerProfileModel.findOne(
      { userId: args.userId, language: args.language },
      { reviewItems: 1 }
    ).lean();
    const existing = doc?.reviewItems?.[reviewKey];
    if (existing && typeof existing.confidence === "number") {
      currentConfidence = existing.confidence;
    }
  } catch {
    // ignore
  }

  const delta =
    args.result === "correct" ? 0.15 : args.result === "almost" ? -0.05 : -0.15;
  const nextConfidence = clampNumber(currentConfidence + delta, 0.5, 0, 1);

  const set: Record<string, any> = {
    [`reviewItems.${reviewKey}.lessonId`]: lessonId,
    [`reviewItems.${reviewKey}.questionId`]: qid,
    [`reviewItems.${reviewKey}.lastReviewedAt`]: now,
    [`reviewItems.${reviewKey}.lastSeenAt`]: now,
    [`reviewItems.${reviewKey}.lastOutcome`]: normalizeOutcome(args.result),
    [`reviewItems.${reviewKey}.lastResult`]: args.result,
    [`reviewItems.${reviewKey}.confidence`]: nextConfidence,
  };

  const conceptKey = safeConceptKey(args.conceptTag);
  if (conceptKey && isHumanConceptLabel(conceptKey)) {
    set[`reviewItems.${reviewKey}.conceptTag`] = conceptKey;
  }

  const inc: Record<string, number> = {};
  if (args.result !== "correct") {
    inc[`reviewItems.${reviewKey}.mistakeCount`] = 1;
  }

  await LearnerProfileModel.updateOne(
    { userId: args.userId, language: args.language },
    {
      $setOnInsert: { userId: args.userId, language: args.language },
      $set: set,
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
    },
    { upsert: true }
  );

  try {
    await normalizeReviewItemsForProfile(args.userId, args.language);
  } catch {
    // ignore
  }
}


export async function recordPracticeAttempt(args: RecordPracticeAttemptArgs): Promise<void> {
  if (!isMongoReady()) return;

  const reasonKey = args.result !== "correct" ? safeReasonKey(args.reasonCode) : null;
  const conceptKey = safeConceptKey(args.conceptTag);

  const inc: Record<string, number> = { practiceAttemptsTotal: 1 };
  if (reasonKey) inc[`mistakeCountsByReason.${reasonKey}`] = 1;
  if (conceptKey && isHumanConceptLabel(conceptKey)) inc[`mistakeCountsByConcept.${conceptKey}`] = 1;

  type PushOps = {
    topMistakeTags?: { $each: string[]; $slice: number };
    recentConfusions?: { $each: Array<{ conceptTag: string; timestamp: Date }>; $slice: number };
  };

  const push: PushOps = {};

  if (args.result !== "correct") {
    const mistakeTag = mistakeTagFromReasonCode(args.reasonCode);
    if (mistakeTag) {
      push.topMistakeTags = { $each: [mistakeTag], $slice: -12 };
    }

    if (conceptKey && isHumanConceptLabel(conceptKey)) {
      push.recentConfusions = {
        $each: [{ conceptTag: conceptKey, timestamp: new Date() }],
        $slice: -12,
      };
    }
  }

  await LearnerProfileModel.updateOne(
    { userId: args.userId, language: args.language },
    {
      $setOnInsert: { userId: args.userId, language: args.language },
      $set: { lastActiveAt: new Date() },
      $inc: inc,
      ...(Object.keys(push).length ? { $push: push } : {}),
    },
    { upsert: true }
  );
}


type GetLearnerProfileSummaryArgs = {
  userId: string;
  language: string;
  maxReasons?: number; // default 3
  maxChars?: number;   // default 260
};

function reasonLabel(code: string): string {
  const c = code.trim().toUpperCase();
  if (c === "ARTICLE") return "articles";
  if (c === "WORD_ORDER") return "word order";
  if (c === "TYPO") return "spelling/typos";
  if (c === "WRONG_LANGUAGE") return "wrong language";
  if (c === "MISSING_SLOT") return "missing word/slot";
  if (c === "OTHER") return "general";
  return c.toLowerCase();
}

function toReasonEntries(v: any): Array<{ key: string; count: number }> {
  if (!v) return [];
  if (v instanceof Map) {
    return Array.from(v.entries()).map(([k, n]) => ({ key: String(k), count: Number(n) || 0 }));
  }
  if (typeof v === "object") {
    return Object.entries(v).map(([k, n]) => ({ key: String(k), count: Number(n) || 0 }));
  }
  return [];
}

export async function getWeakestConceptTag(
  userId: string,
  language: SupportedLanguage
): Promise<string | null> {
  const doc = await LearnerProfileModel.findOne({ userId, language });
  if (!doc) return null;

  const conceptEntries = toReasonEntries((doc as any).mistakeCountsByConcept)
    .filter((e) => e.count > 0 && e.key)
    .sort((a, b) => b.count - a.count);

  if (conceptEntries.length === 0) return null;

  const key = safeConceptKey(conceptEntries[0].key);
  return key ?? null;
}

export async function getConceptMistakeCount(
  userId: string,
  language: SupportedLanguage,
  conceptTag: string
): Promise<number> {
  const key = safeConceptKey(conceptTag);
  if (!key) return 0;

  const doc = await LearnerProfileModel.findOne({ userId, language });
  if (!doc) return 0;

  const conceptEntries = toReasonEntries((doc as any).mistakeCountsByConcept);
  const found = conceptEntries.find((e) => e.key === key);

  return found?.count ?? 0;
}

export async function getLearnerProfileSummary(
  args: GetLearnerProfileSummaryArgs
): Promise<string | null> {
  const maxReasons = typeof args.maxReasons === "number" ? args.maxReasons : 3;
  const maxChars = typeof args.maxChars === "number" ? args.maxChars : 260;

  // Only read when connected (avoid buffering surprises)
  if (mongoose.connection.readyState !== 1) return null;

  const doc: any = await LearnerProfileModel.findOne({
    userId: args.userId,
    language: args.language,
  }).lean();

  if (!doc) return null;

  const reasonEntries = toReasonEntries(doc.mistakeCountsByReason)
    .filter((e) => e.count > 0 && e.key)
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(0, maxReasons));

  const parts: string[] = [];

  if (reasonEntries.length > 0) {
    //NOTE: No counts
    const labels = reasonEntries.map((e) => reasonLabel(e.key))
    parts.push(`Focus areas: ${labels.join(", ")}.`);
  }

  const conceptEntries = toReasonEntries(doc.mistakeCountsByConcept)
    .filter((e) => e.count > 0 && e.key)
    .map((e) => ({key: safeConceptKey(String(e.key)), count: e.count}))
    .filter((e) => e.key && isHumanConceptLabel(e.key))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  if(conceptEntries.length > 0) {
    const concepts = conceptEntries
        .map((e) => e.key.replace(/_/g, " "))
        .join(", ");
    parts.push(`Focus topics: ${concepts}.`);
  }

  const out = parts.join(" ").trim();
  if (!out) return null;

  return out.length > maxChars ? out.slice(0, maxChars).trim() : out;
}

type GetLearnerTopFocusReasonArgs = {
  userId: string;
  language: string;
};

export async function getLearnerTopFocusReason(
  args: GetLearnerTopFocusReasonArgs
): Promise<string | null> {
  // Only read when connected (avoid buffering surprises)
  if (mongoose.connection.readyState !== 1) return null;

  const doc: any = await LearnerProfileModel.findOne({
    userId: args.userId,
    language: args.language,
  }).lean();

  if (!doc) return null;

  const entries = toReasonEntries(doc.mistakeCountsByReason)
    .filter((e) => e.count > 0 && e.key)
    .sort((a, b) => b.count - a.count);

  if (entries.length === 0) return null;

  // Prefer something specific over OTHER when available.
  const top = String(entries[0].key).trim().toUpperCase();
  if (top === "OTHER" && entries.length > 1) {
    return String(entries[1].key).trim().toUpperCase() || null;
  }

  return top || null;
}

export async function getRecentConfusionConceptTag(
  userId: string,
  language: SupportedLanguage
): Promise<string | null> {
  // Only read when connected (avoid buffering in tests/CI)
  if (mongoose.connection.readyState !== 1) return null;

  const doc = (await LearnerProfileModel.findOne(
    { userId, language },
    { recentConfusions: 1 }
  ).lean()) as Record<string, unknown> | null;

  const arr = Array.isArray(doc?.recentConfusions) ? (doc?.recentConfusions as unknown[]) : [];
  if (arr.length === 0) return null;

  const last = arr[arr.length - 1] as Record<string, unknown> | undefined;
  const tag = typeof last?.conceptTag === "string" ? safeConceptKey(last.conceptTag) : "";
  return tag && isHumanConceptLabel(tag) ? tag : null;
}

export async function getTeachingProfilePrefs(
  userId: string,
  language: SupportedLanguage
): Promise<TeachingProfilePrefs | null> {
  // Only read when connected (avoid buffering in tests/CI)
  if (mongoose.connection.readyState !== 1) return null;

  const doc = (await LearnerProfileModel.findOne(
    { userId, language },
    { pace: 1, explanationDepth: 1, forcedAdvanceCount: 1 }
  ).lean()) as Record<string, unknown> | null;

  if (!doc) return null;

  const forcedAdvanceCount =
    typeof doc.forcedAdvanceCount === "number" && Number.isFinite(doc.forcedAdvanceCount)
      ? Math.max(0, Math.trunc(doc.forcedAdvanceCount))
      : 0;

  // If fields weren’t present on older docs, infer softly from behavior.
  const inferredPace: TeachingPace = forcedAdvanceCount >= 2 ? "slow" : "normal";
  const inferredDepth: TeachingExplanationDepth = forcedAdvanceCount >= 2 ? "detailed" : "normal";

  const pace = toPace(doc.pace) ?? inferredPace;
  const explanationDepth = toExplanationDepth(doc.explanationDepth) ?? inferredDepth;

  return { pace, explanationDepth };
}
