"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearnerProfileModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ReviewItemSchema = new mongoose_1.default.Schema({
    lessonId: { type: String, required: true },
    questionId: { type: String, required: true },
    conceptTag: { type: String, default: "" },
    lastSeenAt: { type: Date, required: true },
    lastReviewedAt: { type: Date, required: false },
    lastOutcome: { type: String, default: "wrong" }, // correct|almost|wrong|forced_advance
    mistakeCount: { type: Number, default: 0 },
    confidence: { type: Number, default: 0.5 }, // 0-1
    // legacy fields (kept for compatibility during rollout)
    lastResult: { type: String },
    wrongCount: { type: Number, default: 0 },
    forcedAdvanceCount: { type: Number, default: 0 },
}, { _id: false });
const LearnerProfileSchema = new mongoose_1.default.Schema({
    userId: { type: String, required: true },
    language: { type: String, required: true },
    pace: { type: String, default: "normal" }, // "slow" | "normal"
    explanationDepth: { type: String, default: "normal" }, // "short" | "normal" | "detailed"
    attemptsTotal: { type: Number, default: 0 },
    forcedAdvanceCount: { type: Number, default: 0 },
    practiceAttempts: { type: Number, default: 0 },
    mistakeCountsByReason: { type: Map, of: Number, default: {} },
    mistakeCountsByConcept: { type: Map, of: Number, default: {} },
    // bounded list; we maintain it as a slice
    topMistakeTags: { type: [String], default: [] },
    recentConfusions: {
        type: [
            {
                conceptTag: { type: String, required: true },
                lessonId: { type: String, required: false },
                questionId: { type: String, required: false },
                timestamp: { type: Date, required: true },
            },
        ],
        default: [],
    },
    reviewItems: { type: Map, of: ReviewItemSchema, default: {} },
}, { timestamps: true });
LearnerProfileSchema.index({ userId: 1, language: 1 }, { unique: true });
exports.LearnerProfileModel = mongoose_1.default.models?.LearnerProfile ??
    mongoose_1.default.model("LearnerProfile", LearnerProfileSchema);
