"use strict";
// backend/src/services/supportLevelService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSupportLevelDelta = computeSupportLevelDelta;
exports.updateSupportLevel = updateSupportLevel;
const mongoose_1 = __importDefault(require("mongoose"));
const learnerProfileState_1 = require("../state/learnerProfileState");
const supportLevel_1 = require("../utils/supportLevel");
const DEFAULT_SUPPORT_LEVEL = "high";
const DEFAULT_SUPPORT_NUMBER = (0, supportLevel_1.supportLevelToNumber)(DEFAULT_SUPPORT_LEVEL);
function clampLevel(value) {
    return Math.max(0, Math.min(1, value));
}
function normalizeLevel(value) {
    const normalized = (0, supportLevel_1.normalizeSupportLevel)(value);
    const base = (0, supportLevel_1.supportLevelToNumber)(normalized, DEFAULT_SUPPORT_NUMBER);
    return clampLevel(base);
}
function computeSupportLevelDelta(stats, _currentSupportLevel) {
    const wrongCount = Number.isFinite(stats.wrongCount) ? stats.wrongCount : 0;
    const almostCount = Number.isFinite(stats.almostCount) ? stats.almostCount : 0;
    const hintsUsedCount = Number.isFinite(stats.hintsUsedCount) ? stats.hintsUsedCount : 0;
    const forcedAdvanceCount = Number.isFinite(stats.forcedAdvanceCount) ? stats.forcedAdvanceCount : 0;
    const mistakeCount = wrongCount + almostCount;
    const wrongLow = mistakeCount <= 1;
    const hintsLow = hintsUsedCount <= 1;
    const wrongHigh = mistakeCount >= 3;
    const hintsHigh = hintsUsedCount >= 2;
    if (forcedAdvanceCount === 0 && wrongLow && hintsLow) {
        return -0.05;
    }
    if (forcedAdvanceCount > 0 || wrongHigh || hintsHigh) {
        return 0.05;
    }
    return 0;
}
async function updateSupportLevel(userId, language, delta) {
    // Skip DB writes if not connected (avoid buffering in tests)
    if (mongoose_1.default.connection.readyState !== 1) {
        return clampLevel(DEFAULT_SUPPORT_NUMBER + delta);
    }
    const doc = (await learnerProfileState_1.LearnerProfileModel.findOne({ userId, language }, { supportLevel: 1, supportMode: 1 }).lean());
    const current = normalizeLevel(doc?.supportLevel);
    const supportMode = doc?.supportMode === "manual" ? "manual" : "auto";
    if (supportMode === "manual") {
        return current;
    }
    const next = clampLevel(current + delta);
    const nextLevel = (0, supportLevel_1.supportLevelFromNumber)(next, DEFAULT_SUPPORT_LEVEL);
    await learnerProfileState_1.LearnerProfileModel.updateOne({ userId, language }, {
        $setOnInsert: { userId, language },
        $set: { supportLevel: nextLevel, supportMode, lastActiveAt: new Date() },
    }, { upsert: true });
    return next;
}
