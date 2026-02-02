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
    const inc: Record<string, number> = {
      attemptsTotal: 1,
    };

    if (args.forcedAdvance) {
      inc.forcedAdvanceCount = 1;
    }

    if (args.result !== "correct" && conceptKey) {
      inc[`mistakeCountsByConcept.${conceptKey}`] = 1;
    }

    if (reasonKey) {
      inc[`mistakeCountsByReason.${reasonKey}`] = 1;
    }

    await LearnerProfileModel.updateOne(
      { userId: args.userId, language: args.language },
      {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: { lastActiveAt: new Date() },
        $inc: inc,
      },
      { upsert: true },
    );
}

export async function recordPracticeAttempt(args: RecordPracticeAttemptArgs): Promise<void> {
    if (!isMongoReady()) return;

    const reasonKey = args.result !== "correct" ? safeReasonKey(args.reasonCode) : null;

    const inc: Record<string, number> = {
      attemptsTotal: 1,
      practiceAttemptsTotal: 1,
    };

    if (reasonKey) {
      inc[`mistakeCountsByReason.${reasonKey}`] = 1;
    }

    const conceptKey = safeConceptKey(args.conceptTag);
    if (args.result !== "correct" && conceptKey) {
      inc[`mistakeCountsByConcept.${conceptKey}`] = 1;
    }


    await LearnerProfileModel.updateOne(
      { userId: args.userId, language: args.language },
      {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: { lastActiveAt: new Date() },
        $inc: inc,
      },
      { upsert: true },
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

function isHumanConceptLabel(key: string): boolean {
    // Keep only simple human tags like "greetings", "word_order", etc
    //and avoid tags like "lesson-basic-1-q1" and so on.
    return /^[a-z][a-z_]{2,}$/.test(key);
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
