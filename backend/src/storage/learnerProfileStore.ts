// backend/src/storage/learnerProfileStore.ts

import mongoose from "mongoose";
import { LearnerProfileModel } from "../state/learnerProfileState";
import type { EvalResult, ReasonCode } from "../state/answerEvaluator";
import { SupportedLanguage } from "../types";

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
  conceptTag?: string;
};

type RecordPracticeAttemptArgs = {
  userId: string;
  language: string;
  result: EvalResult;
  reasonCode?: ReasonCode;
  conceptTag?: string;
};

export async function recordLessonAttempt(args: RecordLessonAttemptArgs): Promise<void> {
  if (!isMongoReady()) return;

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

