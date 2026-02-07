"use strict";
// backend/src/storage/learnerProfileStore.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTeachingProfilePrefs = updateTeachingProfilePrefs;
exports.getInstructionLanguage = getInstructionLanguage;
exports.setInstructionLanguage = setInstructionLanguage;
exports.recordLessonAttempt = recordLessonAttempt;
exports.recordReviewPracticeOutcome = recordReviewPracticeOutcome;
exports.enqueueReviewQueueItems = enqueueReviewQueueItems;
exports.getReviewQueueSnapshot = getReviewQueueSnapshot;
exports.recordPracticeAttempt = recordPracticeAttempt;
exports.getWeakestConceptTag = getWeakestConceptTag;
exports.getConceptMistakeCount = getConceptMistakeCount;
exports.getLearnerProfileSummary = getLearnerProfileSummary;
exports.getLearnerTopFocusReason = getLearnerTopFocusReason;
exports.getRecentConfusionConceptTag = getRecentConfusionConceptTag;
exports.getTeachingProfilePrefs = getTeachingProfilePrefs;
const mongoose_1 = __importDefault(require("mongoose"));
const learnerProfileState_1 = require("../state/learnerProfileState");
const instructionLanguage_1 = require("../utils/instructionLanguage");
function isMongoReady() {
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    // We skip writes unless connected to avoid buffering/hanging in tests.
    return mongoose_1.default.connection.readyState === 1;
}
function safeReasonKey(reasonCode) {
    if (typeof reasonCode !== "string")
        return null;
    const t = reasonCode.trim().toUpperCase();
    if (!t)
        return null;
    // Protect against Mongo dot-path separators.
    return t.replace(/[.$]/g, "_");
}
function safeConceptKey(raw) {
    const t = (raw || "").trim().toLowerCase();
    if (!t)
        return "";
    return t.replace(/[.$]/g, "_").replace(/\s+/g, "_").slice(0, 48);
}
function isHumanConceptLabel(key) {
    // Keep only simple human tags like "greetings", "articles", "word_order"
    return /^[a-z][a-z0-9_]{2,47}$/.test(key);
}
function toPace(v) {
    return v === "slow" || v === "normal" ? v : undefined;
}
function toExplanationDepth(v) {
    return v === "short" || v === "normal" || v === "detailed" ? v : undefined;
}
const DEFAULT_INSTRUCTION_LANGUAGE = "en";
async function updateTeachingProfilePrefs(args) {
    if (!isMongoReady())
        return;
    const pace = toPace(args.pace);
    const explanationDepth = toExplanationDepth(args.explanationDepth);
    if (!pace && !explanationDepth)
        return;
    const set = { lastActiveAt: new Date() };
    if (pace)
        set.pace = pace;
    if (explanationDepth)
        set.explanationDepth = explanationDepth;
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: set,
    }, { upsert: true });
}
async function getInstructionLanguage(userId, language) {
    if (!isMongoReady())
        return DEFAULT_INSTRUCTION_LANGUAGE;
    const doc = (await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { instructionLanguage: 1 }).lean());
    if (!doc)
        return DEFAULT_INSTRUCTION_LANGUAGE;
    const raw = doc.instructionLanguage;
    return (0, instructionLanguage_1.normalizeLanguage)(raw) ?? DEFAULT_INSTRUCTION_LANGUAGE;
}
async function setInstructionLanguage(args) {
    if (!isMongoReady())
        return;
    const normalized = (0, instructionLanguage_1.normalizeLanguage)(args.instructionLanguage);
    if (!normalized)
        return;
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: { instructionLanguage: normalized, lastActiveAt: new Date() },
    }, { upsert: true });
}
function mistakeTagFromReasonCode(reasonCode) {
    const c = typeof reasonCode === "string" ? reasonCode.trim().toUpperCase() : "";
    if (!c)
        return null;
    if (c === "ARTICLE")
        return "articles";
    if (c === "WORD_ORDER")
        return "word_order";
    if (c === "TYPO")
        return "typos";
    if (c === "WRONG_LANGUAGE")
        return "wrong_language";
    if (c === "MISSING_SLOT")
        return "missing_slot";
    if (c === "OTHER")
        return "general";
    return "general";
}
// Phase 7.4: Review items are keyed as object paths (reviewItems.<key>...) in Mongo.
// Keep the key path-safe (no dots, no leading $) and stable.
function makeReviewKey(lessonId, questionId) {
    const raw = `${lessonId}__q${String(questionId)}`;
    // Replace anything that could break Mongo dot-notation paths.
    const safe = raw.replace(/[^a-zA-Z0-9_\-]/g, "_");
    return safe.startsWith("$") ? `_${safe}` : safe;
}
function parseReviewKey(key) {
    const idx = key.indexOf("__");
    if (idx <= 0 || idx >= key.length - 1)
        return null;
    const lessonId = key.slice(0, idx).trim();
    let questionId = key.slice(idx + 2).trim();
    if (!lessonId || !questionId)
        return null;
    if (questionId.startsWith("q"))
        questionId = questionId.slice(1);
    if (!questionId)
        return null;
    return { lessonId, questionId };
}
const MAX_REVIEW_ITEMS = 120;
const MAX_REVIEW_MISTAKES = 20;
function clampNumber(v, fallback, min, max) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(min, Math.min(max, n));
}
function clampInt(v, fallback, min, max) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}
function normalizeOutcome(value) {
    const v = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (v === "correct" || v === "almost" || v === "wrong" || v === "forced_advance")
        return v;
    return "wrong";
}
function outcomeConfidence(outcome) {
    if (outcome === "almost")
        return 0.55;
    if (outcome === "wrong")
        return 0.35;
    if (outcome === "forced_advance")
        return 0.2;
    return 0.6;
}
function coerceDate(value) {
    if (value instanceof Date)
        return Number.isFinite(value.getTime()) ? value : null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}
function normalizeReviewItems(raw) {
    let changed = false;
    const entries = [];
    const iterable = raw instanceof Map ? Array.from(raw.entries()) : typeof raw === "object" && raw ? Object.entries(raw) : [];
    for (const [key, value] of iterable) {
        if (typeof key !== "string" || !key) {
            changed = true;
            continue;
        }
        let lessonId = typeof value?.lessonId === "string" ? value.lessonId.trim() : "";
        let questionId = typeof value?.questionId === "string" ? value.questionId.trim() : "";
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
        let conceptTag = typeof value?.conceptTag === "string" ? safeConceptKey(value.conceptTag) : "";
        if (conceptTag && !isHumanConceptLabel(conceptTag)) {
            conceptTag = "";
            changed = true;
        }
        const lastSeenAt = coerceDate(value?.lastSeenAt);
        if (!lastSeenAt) {
            changed = true;
            continue;
        }
        const rawOutcome = value?.lastOutcome ?? value?.lastResult;
        const lastOutcome = normalizeOutcome(rawOutcome);
        const mistakeRaw = typeof value?.mistakeCount === "number"
            ? value.mistakeCount
            : value?.wrongCount ?? 0;
        const mistakeCount = clampInt(mistakeRaw, 0, 0, MAX_REVIEW_MISTAKES);
        if (mistakeCount !== mistakeRaw)
            changed = true;
        const confidenceRaw = value?.confidence;
        const confidence = clampNumber(confidenceRaw, outcomeConfidence(lastOutcome), 0, 1);
        if (typeof confidenceRaw !== "number" || confidence !== confidenceRaw)
            changed = true;
        const record = {
            lessonId,
            questionId,
            conceptTag,
            lastSeenAt,
            lastOutcome,
            mistakeCount,
            confidence,
        };
        const lastReviewedAt = coerceDate(value?.lastReviewedAt);
        if (lastReviewedAt)
            record.lastReviewedAt = lastReviewedAt;
        if (typeof value?.lastResult === "string")
            record.lastResult = value.lastResult;
        if (typeof value?.wrongCount === "number")
            record.wrongCount = value.wrongCount;
        if (typeof value?.forcedAdvanceCount === "number")
            record.forcedAdvanceCount = value.forcedAdvanceCount;
        entries.push([key, record, lastSeenAt.getTime()]);
    }
    entries.sort((a, b) => b[2] - a[2]);
    if (entries.length > MAX_REVIEW_ITEMS) {
        entries.length = MAX_REVIEW_ITEMS;
        changed = true;
    }
    const out = {};
    for (const [key, record] of entries) {
        out[key] = record;
    }
    return { items: out, changed };
}
async function normalizeReviewItemsForProfile(userId, language) {
    if (!isMongoReady())
        return;
    const doc = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { reviewItems: 1 }).lean();
    if (!doc?.reviewItems)
        return;
    const { items, changed } = normalizeReviewItems(doc.reviewItems);
    if (!changed)
        return;
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId, language }, { $set: { reviewItems: items } });
}
async function recordLessonAttempt(args) {
    if (!isMongoReady())
        return;
    const reasonKey = args.result !== "correct" ? safeReasonKey(args.reasonCode) : null;
    const conceptKey = safeConceptKey(args.conceptTag);
    const inc = { attemptsTotal: 1 };
    if (args.forcedAdvance)
        inc.forcedAdvanceCount = 1;
    if (reasonKey)
        inc[`mistakeCountsByReason.${reasonKey}`] = 1;
    if (conceptKey && isHumanConceptLabel(conceptKey))
        inc[`mistakeCountsByConcept.${conceptKey}`] = 1;
    const now = new Date();
    const push = {};
    const set = { lastActiveAt: now };
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
        const shouldRecordReview = args.forcedAdvance || args.result === "almost" || Boolean(args.repeatedWrong);
        // Phase 7.4: track a bounded, privacy-safe review candidate for calm spaced repetition.
        // Only capture when we have enough identifiers to safely find the question again later.
        if (shouldRecordReview &&
            typeof args.lessonId === "string" &&
            args.lessonId.trim() &&
            args.questionId != null) {
            const qid = String(args.questionId ?? "").trim();
            const lessonId = args.lessonId.trim();
            if (qid) {
                const reviewKey = makeReviewKey(lessonId, qid);
                const lastOutcome = args.forcedAdvance
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
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: set,
        $inc: inc,
        ...(Object.keys(push).length ? { $push: push } : {}),
    }, { upsert: true });
    if (args.result !== "correct") {
        const shouldRecordReview = args.forcedAdvance || args.result === "almost" || Boolean(args.repeatedWrong);
        if (shouldRecordReview) {
            try {
                await normalizeReviewItemsForProfile(args.userId, args.language);
            }
            catch {
                // best-effort: don't block lesson flow
            }
        }
    }
}
async function recordReviewPracticeOutcome(args) {
    if (!isMongoReady())
        return;
    const lessonId = typeof args.lessonId === "string" ? args.lessonId.trim() : "";
    const qid = typeof args.questionId === "string" ? args.questionId.trim() : "";
    if (!lessonId || !qid)
        return;
    const reviewKey = makeReviewKey(lessonId, qid);
    const now = new Date();
    let currentConfidence = 0.5;
    try {
        const doc = await learnerProfileState_1.LearnerProfileModel.findOne({ userId: args.userId, language: args.language }, { reviewItems: 1 }).lean();
        const existing = doc?.reviewItems?.[reviewKey];
        if (existing && typeof existing.confidence === "number") {
            currentConfidence = existing.confidence;
        }
    }
    catch {
        // ignore
    }
    const delta = args.result === "correct" ? 0.15 : args.result === "almost" ? -0.05 : -0.15;
    const nextConfidence = clampNumber(currentConfidence + delta, 0.5, 0, 1);
    if (args.result === "correct" && nextConfidence >= 0.9) {
        await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, { $unset: { [`reviewItems.${reviewKey}`]: "" } });
        return;
    }
    const set = {
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
    const inc = {};
    if (args.result !== "correct") {
        inc[`reviewItems.${reviewKey}.mistakeCount`] = 1;
    }
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: set,
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
    }, { upsert: true });
    try {
        await normalizeReviewItemsForProfile(args.userId, args.language);
    }
    catch {
        // ignore
    }
}
const MAX_REVIEW_QUEUE_ITEMS = 60;
async function enqueueReviewQueueItems(args) {
    if (!isMongoReady())
        return;
    if (!args.items || args.items.length === 0) {
        if (args.summary) {
            await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
                $setOnInsert: { userId: args.userId, language: args.language },
                $set: { lastSummary: args.summary, lastActiveAt: new Date() },
            }, { upsert: true });
        }
        return;
    }
    const doc = await learnerProfileState_1.LearnerProfileModel.findOne({ userId: args.userId, language: args.language }, { reviewQueue: 1 }).lean();
    const existing = Array.isArray(doc?.reviewQueue) ? doc.reviewQueue : [];
    const nextQueue = [...existing];
    for (const item of args.items) {
        if (!item?.id || !item.lessonId)
            continue;
        const duplicate = nextQueue.find((q) => q.lessonId === item.lessonId && q.conceptTag === item.conceptTag && q.prompt === item.prompt);
        if (!duplicate)
            nextQueue.push(item);
    }
    nextQueue.sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return tb - ta;
    });
    if (nextQueue.length > MAX_REVIEW_QUEUE_ITEMS) {
        nextQueue.length = MAX_REVIEW_QUEUE_ITEMS;
    }
    const set = { reviewQueue: nextQueue, lastActiveAt: new Date() };
    if (args.summary)
        set.lastSummary = args.summary;
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: set,
    }, { upsert: true });
}
async function getReviewQueueSnapshot(userId, language) {
    if (!isMongoReady())
        return null;
    const doc = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { reviewQueue: 1, lastSummary: 1 }).lean();
    if (!doc)
        return null;
    return {
        reviewQueue: Array.isArray(doc.reviewQueue) ? doc.reviewQueue : [],
        lastSummary: doc.lastSummary,
    };
}
async function recordPracticeAttempt(args) {
    if (!isMongoReady())
        return;
    const reasonKey = args.result !== "correct" ? safeReasonKey(args.reasonCode) : null;
    const conceptKey = safeConceptKey(args.conceptTag);
    const inc = { practiceAttemptsTotal: 1 };
    if (reasonKey)
        inc[`mistakeCountsByReason.${reasonKey}`] = 1;
    if (conceptKey && isHumanConceptLabel(conceptKey))
        inc[`mistakeCountsByConcept.${conceptKey}`] = 1;
    const push = {};
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
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: { lastActiveAt: new Date() },
        $inc: inc,
        ...(Object.keys(push).length ? { $push: push } : {}),
    }, { upsert: true });
}
function reasonLabel(code) {
    const c = code.trim().toUpperCase();
    if (c === "ARTICLE")
        return "articles";
    if (c === "WORD_ORDER")
        return "word order";
    if (c === "TYPO")
        return "spelling/typos";
    if (c === "WRONG_LANGUAGE")
        return "wrong language";
    if (c === "MISSING_SLOT")
        return "missing word/slot";
    if (c === "OTHER")
        return "general";
    return c.toLowerCase();
}
function toReasonEntries(v) {
    if (!v)
        return [];
    if (v instanceof Map) {
        return Array.from(v.entries()).map(([k, n]) => ({ key: String(k), count: Number(n) || 0 }));
    }
    if (typeof v === "object") {
        return Object.entries(v).map(([k, n]) => ({ key: String(k), count: Number(n) || 0 }));
    }
    return [];
}
async function getWeakestConceptTag(userId, language) {
    const doc = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language });
    if (!doc)
        return null;
    const conceptEntries = toReasonEntries(doc.mistakeCountsByConcept)
        .filter((e) => e.count > 0 && e.key)
        .sort((a, b) => b.count - a.count);
    if (conceptEntries.length === 0)
        return null;
    const key = safeConceptKey(conceptEntries[0].key);
    return key ?? null;
}
async function getConceptMistakeCount(userId, language, conceptTag) {
    const key = safeConceptKey(conceptTag);
    if (!key)
        return 0;
    const doc = await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language });
    if (!doc)
        return 0;
    const conceptEntries = toReasonEntries(doc.mistakeCountsByConcept);
    const found = conceptEntries.find((e) => e.key === key);
    return found?.count ?? 0;
}
async function getLearnerProfileSummary(args) {
    const maxReasons = typeof args.maxReasons === "number" ? args.maxReasons : 3;
    const maxChars = typeof args.maxChars === "number" ? args.maxChars : 260;
    // Only read when connected (avoid buffering surprises)
    if (mongoose_1.default.connection.readyState !== 1)
        return null;
    const doc = await learnerProfileState_1.LearnerProfileModel.findOne({
        userId: args.userId,
        language: args.language,
    }).lean();
    if (!doc)
        return null;
    const reasonEntries = toReasonEntries(doc.mistakeCountsByReason)
        .filter((e) => e.count > 0 && e.key)
        .sort((a, b) => b.count - a.count)
        .slice(0, Math.max(0, maxReasons));
    const parts = [];
    if (reasonEntries.length > 0) {
        //NOTE: No counts
        const labels = reasonEntries.map((e) => reasonLabel(e.key));
        parts.push(`Focus areas: ${labels.join(", ")}.`);
    }
    const conceptEntries = toReasonEntries(doc.mistakeCountsByConcept)
        .filter((e) => e.count > 0 && e.key)
        .map((e) => ({ key: safeConceptKey(String(e.key)), count: e.count }))
        .filter((e) => e.key && isHumanConceptLabel(e.key))
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);
    if (conceptEntries.length > 0) {
        const concepts = conceptEntries
            .map((e) => e.key.replace(/_/g, " "))
            .join(", ");
        parts.push(`Focus topics: ${concepts}.`);
    }
    const out = parts.join(" ").trim();
    if (!out)
        return null;
    return out.length > maxChars ? out.slice(0, maxChars).trim() : out;
}
async function getLearnerTopFocusReason(args) {
    // Only read when connected (avoid buffering surprises)
    if (mongoose_1.default.connection.readyState !== 1)
        return null;
    const doc = await learnerProfileState_1.LearnerProfileModel.findOne({
        userId: args.userId,
        language: args.language,
    }).lean();
    if (!doc)
        return null;
    const entries = toReasonEntries(doc.mistakeCountsByReason)
        .filter((e) => e.count > 0 && e.key)
        .sort((a, b) => b.count - a.count);
    if (entries.length === 0)
        return null;
    // Prefer something specific over OTHER when available.
    const top = String(entries[0].key).trim().toUpperCase();
    if (top === "OTHER" && entries.length > 1) {
        return String(entries[1].key).trim().toUpperCase() || null;
    }
    return top || null;
}
async function getRecentConfusionConceptTag(userId, language) {
    // Only read when connected (avoid buffering in tests/CI)
    if (mongoose_1.default.connection.readyState !== 1)
        return null;
    const doc = (await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { recentConfusions: 1 }).lean());
    const arr = Array.isArray(doc?.recentConfusions) ? doc?.recentConfusions : [];
    if (arr.length === 0)
        return null;
    const last = arr[arr.length - 1];
    const tag = typeof last?.conceptTag === "string" ? safeConceptKey(last.conceptTag) : "";
    return tag && isHumanConceptLabel(tag) ? tag : null;
}
async function getTeachingProfilePrefs(userId, language) {
    // Only read when connected (avoid buffering in tests/CI)
    if (mongoose_1.default.connection.readyState !== 1)
        return null;
    const doc = (await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { pace: 1, explanationDepth: 1, forcedAdvanceCount: 1 }).lean());
    if (!doc)
        return null;
    const forcedAdvanceCount = typeof doc.forcedAdvanceCount === "number" && Number.isFinite(doc.forcedAdvanceCount)
        ? Math.max(0, Math.trunc(doc.forcedAdvanceCount))
        : 0;
    // If fields weren’t present on older docs, infer softly from behavior.
    const inferredPace = forcedAdvanceCount >= 2 ? "slow" : "normal";
    const inferredDepth = forcedAdvanceCount >= 2 ? "detailed" : "normal";
    const pace = toPace(doc.pace) ?? inferredPace;
    const explanationDepth = toExplanationDepth(doc.explanationDepth) ?? inferredDepth;
    return { pace, explanationDepth };
}
