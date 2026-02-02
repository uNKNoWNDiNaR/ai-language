"use strict";
// backend/src/storage/learnerProfileStore.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordLessonAttempt = recordLessonAttempt;
exports.recordPracticeAttempt = recordPracticeAttempt;
exports.getWeakestConceptTag = getWeakestConceptTag;
exports.getConceptMistakeCount = getConceptMistakeCount;
exports.getLearnerProfileSummary = getLearnerProfileSummary;
exports.getLearnerTopFocusReason = getLearnerTopFocusReason;
const mongoose_1 = __importDefault(require("mongoose"));
const learnerProfileState_1 = require("../state/learnerProfileState");
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
async function recordLessonAttempt(args) {
    if (!isMongoReady())
        return;
    const reasonKey = args.result !== "correct" ? safeReasonKey(args.reasonCode) : null;
    const conceptKey = safeConceptKey(args.conceptTag);
    const inc = {
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
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: { lastActiveAt: new Date() },
        $inc: inc,
    }, { upsert: true });
}
async function recordPracticeAttempt(args) {
    if (!isMongoReady())
        return;
    const reasonKey = args.result !== "correct" ? safeReasonKey(args.reasonCode) : null;
    const inc = {
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
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId: args.userId, language: args.language }, {
        $setOnInsert: { userId: args.userId, language: args.language },
        $set: { lastActiveAt: new Date() },
        $inc: inc,
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
function isHumanConceptLabel(key) {
    // Keep only simple human tags like "greetings", "word_order", etc
    //and avoid tags like "lesson-basic-1-q1" and so on.
    return /^[a-z][a-z_]{2,}$/.test(key);
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
