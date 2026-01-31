"use strict";
// backend/src/storage/learnerProfileStore.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordLessonAttempt = recordLessonAttempt;
exports.recordPracticeAttempt = recordPracticeAttempt;
exports.getLearnerProfileSummary = getLearnerProfileSummary;
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
async function recordLessonAttempt(args) {
    if (!isMongoReady())
        return;
    const reasonKey = args.result !== "correct" ? safeReasonKey(args.reasonCode) : null;
    const inc = {
        attemptsTotal: 1,
    };
    if (args.forcedAdvance) {
        inc.forcedAdvanceCount = 1;
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
    const entries = toReasonEntries(doc.mistakeCountsByReason)
        .filter((e) => e.count > 0 && e.key)
        .sort((a, b) => b.count - a.count)
        .slice(0, Math.max(0, maxReasons));
    const parts = [];
    if (entries.length > 0) {
        parts.push(`Focus areas: ${entries.map((e) => `${reasonLabel(e.key)} (${e.count})`).join(", ")}.`);
    }
    const forced = Number(doc.forcedAdvanceCount) || 0;
    const practice = Number(doc.practiceAttemptsTotal) || 0;
    parts.push(`Forced advances: ${forced}.`);
    parts.push(`Practice attempts: ${practice}.`);
    const out = parts.join(" ").trim();
    if (!out)
        return null;
    return out.length > maxChars ? out.slice(0, maxChars).trim() : out;
}
