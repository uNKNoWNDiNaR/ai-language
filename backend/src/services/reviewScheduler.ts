// backend/src/services/reviewScheduler.ts

export type ReviewCandidate = {
  lessonId: string;
  questionId: string;
  conceptTag?: string;
  lastSeenAt?: Date | string;
  lastReviewedAt?: Date | string;
  mistakeCount?: number;
  confidence?: number;
};

export type SuggestedReviewItem = {
  lessonId: string;
  questionId: string;
  conceptTag: string;
  lastSeenAt: Date;
  mistakeCount: number;
  confidence: number;
  score: number;
};

export function pickSuggestedReviewItems(
  items: ReviewCandidate[],
  now: Date,
  limit = 2
): SuggestedReviewItem[] {
  const maxItems = clampInt(limit, 2, 1, 5);
  const safeNow = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const reviewCooldownMs = 12 * 60 * 60 * 1000; // 12 hours

  const candidates: SuggestedReviewItem[] = [];

  for (const item of items) {
    if (!item) continue;
    const lessonId = typeof item.lessonId === "string" ? item.lessonId.trim() : "";
    const questionId = typeof item.questionId === "string" ? item.questionId.trim() : "";
    if (!lessonId || !questionId) continue;

    const lastSeenAt = coerceDate(item.lastSeenAt) ?? safeNow;
    const lastReviewedAt = coerceDate(item.lastReviewedAt);
    if (lastReviewedAt && safeNow.getTime() - lastReviewedAt.getTime() < reviewCooldownMs) {
      continue;
    }
    const mistakeCount = clampInt(item.mistakeCount, 0, 0, 1_000);
    if (mistakeCount <= 0) continue;

    const confidence = clampNumber(item.confidence, 0.5, 0, 1);
    const ageDays = clampInt(
      Math.floor((safeNow.getTime() - lastSeenAt.getTime()) / 86_400_000),
      0,
      0,
      30
    );

    const score = mistakeCount * 10 + ageDays + (1 - confidence) * 5;
    const conceptTag = typeof item.conceptTag === "string" ? item.conceptTag.trim() : "";

    candidates.push({
      lessonId,
      questionId,
      conceptTag,
      lastSeenAt,
      mistakeCount,
      confidence,
      score,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.lastSeenAt.getTime() !== a.lastSeenAt.getTime()) {
      return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
    }
    const tagCmp = a.conceptTag.localeCompare(b.conceptTag);
    if (tagCmp !== 0) return tagCmp;
    const lidCmp = a.lessonId.localeCompare(b.lessonId);
    if (lidCmp !== 0) return lidCmp;
    return a.questionId.localeCompare(b.questionId);
  });

  return candidates.slice(0, maxItems);
}

export function suggestReviewItems(
  input: { reviewItems?: Map<string, ReviewCandidate> | Record<string, ReviewCandidate> | null },
  opts?: { maxItems?: number; now?: Date }
): SuggestedReviewItem[] {
  const list = normalizeCandidates(input.reviewItems);
  return pickSuggestedReviewItems(list, opts?.now ?? new Date(), opts?.maxItems ?? 2);
}

function normalizeCandidates(
  raw: Map<string, ReviewCandidate> | Record<string, ReviewCandidate> | null | undefined
): ReviewCandidate[] {
  if (!raw) return [];
  if (raw instanceof Map) return Array.from(raw.values());
  if (typeof raw === "object") return Object.values(raw);
  return [];
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const d = new Date(value as any);
  return Number.isFinite(d.getTime()) ? d : null;
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
