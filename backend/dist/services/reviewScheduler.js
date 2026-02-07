"use strict";
// backend/src/services/reviewScheduler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickSuggestedReviewItems = pickSuggestedReviewItems;
exports.suggestReviewItems = suggestReviewItems;
exports.computeNextReviewDueAt = computeNextReviewDueAt;
exports.pickDueReviewQueueItems = pickDueReviewQueueItems;
function pickSuggestedReviewItems(items, now, limit = 2) {
    const maxItems = clampInt(limit, 2, 1, 5);
    const safeNow = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
    const reviewCooldownMs = 12 * 60 * 60 * 1000; // 12 hours
    const candidates = [];
    const cooldownCandidates = [];
    function buildCandidate(item) {
        if (!item)
            return null;
        const lessonId = typeof item.lessonId === "string" ? item.lessonId.trim() : "";
        const questionId = typeof item.questionId === "string" ? item.questionId.trim() : "";
        if (!lessonId || !questionId)
            return null;
        const lastSeenAt = coerceDate(item.lastSeenAt) ?? safeNow;
        let mistakeCount = clampInt(item.mistakeCount, 0, 0, 1000);
        if (mistakeCount <= 0) {
            const wrongCount = clampInt(item.wrongCount, 0, 0, 1000);
            const forcedCount = clampInt(item.forcedAdvanceCount, 0, 0, 1000);
            if (wrongCount > 0) {
                mistakeCount = wrongCount;
            }
            else if (forcedCount > 0) {
                mistakeCount = forcedCount;
            }
            else if (typeof item.lastOutcome === "string") {
                const outcome = item.lastOutcome.toLowerCase();
                if (outcome === "wrong" || outcome === "almost" || outcome === "forced_advance") {
                    mistakeCount = 1;
                }
            }
            else {
                mistakeCount = 1;
            }
        }
        if (mistakeCount <= 0)
            return null;
        const confidence = clampNumber(item.confidence, 0.5, 0, 1);
        if (confidence >= 0.9)
            return null;
        const ageDays = clampInt(Math.floor((safeNow.getTime() - lastSeenAt.getTime()) / 86400000), 0, 0, 30);
        const score = mistakeCount * 10 + ageDays + (1 - confidence) * 5;
        const conceptTag = typeof item.conceptTag === "string" ? item.conceptTag.trim() : "";
        return {
            lessonId,
            questionId,
            conceptTag,
            lastSeenAt,
            mistakeCount,
            confidence,
            score,
        };
    }
    for (const item of items) {
        const lastReviewedAt = coerceDate(item.lastReviewedAt);
        const candidate = buildCandidate(item);
        if (!candidate)
            continue;
        if (lastReviewedAt && safeNow.getTime() - lastReviewedAt.getTime() < reviewCooldownMs) {
            cooldownCandidates.push(candidate);
            continue;
        }
        candidates.push(candidate);
    }
    const finalCandidates = candidates.length > 0 ? candidates : cooldownCandidates;
    finalCandidates.sort((a, b) => {
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
    return finalCandidates.slice(0, maxItems);
}
function suggestReviewItems(input, opts) {
    const list = normalizeCandidates(input.reviewItems);
    return pickSuggestedReviewItems(list, opts?.now ?? new Date(), opts?.maxItems ?? 2);
}
function normalizeCandidates(raw) {
    if (!raw)
        return [];
    const entries = raw instanceof Map ? Array.from(raw.entries()) : Object.entries(raw);
    return entries.map(([key, value]) => {
        const candidate = { ...value };
        if (typeof key === "string" && (!candidate.lessonId || !candidate.questionId)) {
            const idx = key.indexOf("__");
            if (idx > 0 && idx < key.length - 2) {
                const lessonId = key.slice(0, idx).trim();
                let questionId = key.slice(idx + 2).trim();
                if (questionId.startsWith("q"))
                    questionId = questionId.slice(1);
                if (lessonId && !candidate.lessonId)
                    candidate.lessonId = lessonId;
                if (questionId && !candidate.questionId)
                    candidate.questionId = questionId;
            }
        }
        return candidate;
    });
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
function computeNextReviewDueAt(attempts, result, now = new Date()) {
    if (result !== "correct")
        return now;
    const count = Math.max(1, Math.floor(attempts));
    if (count === 1)
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (count === 2)
        return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}
function pickDueReviewQueueItems(items, now, limit = 5) {
    const safeNow = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
    const maxItems = clampInt(limit, 5, 1, 5);
    if (!items || items.length === 0)
        return [];
    const due = items.filter((item) => {
        const dueAt = item?.dueAt instanceof Date ? item.dueAt : new Date(item?.dueAt);
        return Number.isFinite(dueAt.getTime()) && dueAt.getTime() <= safeNow.getTime();
    });
    due.sort((a, b) => {
        const da = a.dueAt instanceof Date ? a.dueAt.getTime() : new Date(a.dueAt).getTime();
        const db = b.dueAt instanceof Date ? b.dueAt.getTime() : new Date(b.dueAt).getTime();
        return da - db;
    });
    return due.slice(0, maxItems);
}
