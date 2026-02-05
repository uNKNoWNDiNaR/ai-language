"use strict";
// backend/src/services/reviewScheduler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickSuggestedReviewItems = pickSuggestedReviewItems;
exports.suggestReviewItems = suggestReviewItems;
function pickSuggestedReviewItems(items, now, limit = 2) {
    const maxItems = clampInt(limit, 2, 1, 5);
    const safeNow = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
    const reviewCooldownMs = 12 * 60 * 60 * 1000; // 12 hours
    const candidates = [];
    for (const item of items) {
        if (!item)
            continue;
        const lessonId = typeof item.lessonId === "string" ? item.lessonId.trim() : "";
        const questionId = typeof item.questionId === "string" ? item.questionId.trim() : "";
        if (!lessonId || !questionId)
            continue;
        const lastSeenAt = coerceDate(item.lastSeenAt) ?? safeNow;
        const lastReviewedAt = coerceDate(item.lastReviewedAt);
        if (lastReviewedAt && safeNow.getTime() - lastReviewedAt.getTime() < reviewCooldownMs) {
            continue;
        }
        const mistakeCount = clampInt(item.mistakeCount, 0, 0, 1000);
        if (mistakeCount <= 0)
            continue;
        const confidence = clampNumber(item.confidence, 0.5, 0, 1);
        const ageDays = clampInt(Math.floor((safeNow.getTime() - lastSeenAt.getTime()) / 86400000), 0, 0, 30);
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
        if (b.score !== a.score)
            return b.score - a.score;
        if (b.lastSeenAt.getTime() !== a.lastSeenAt.getTime()) {
            return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
        }
        const tagCmp = a.conceptTag.localeCompare(b.conceptTag);
        if (tagCmp !== 0)
            return tagCmp;
        const lidCmp = a.lessonId.localeCompare(b.lessonId);
        if (lidCmp !== 0)
            return lidCmp;
        return a.questionId.localeCompare(b.questionId);
    });
    return candidates.slice(0, maxItems);
}
function suggestReviewItems(input, opts) {
    const list = normalizeCandidates(input.reviewItems);
    return pickSuggestedReviewItems(list, opts?.now ?? new Date(), opts?.maxItems ?? 2);
}
function normalizeCandidates(raw) {
    if (!raw)
        return [];
    if (raw instanceof Map)
        return Array.from(raw.values());
    if (typeof raw === "object")
        return Object.values(raw);
    return [];
}
function coerceDate(value) {
    if (value instanceof Date)
        return Number.isFinite(value.getTime()) ? value : null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}
function clampInt(v, fallback, min, max) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}
function clampNumber(v, fallback, min, max) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(min, Math.min(max, n));
}
