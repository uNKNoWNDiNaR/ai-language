"use strict";
// src/sessionState.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LessonSessionModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ChatMessageSchema = new mongoose_1.default.Schema({
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});
const LessonSessionSchema = new mongoose_1.default.Schema({
    userId: { type: String, required: true },
    lessonId: String,
    language: { type: String, required: true },
    state: { type: String, required: true },
    attempts: { type: Number, required: true },
    maxAttempts: { type: Number, required: true },
    currentQuestionIndex: { type: Number, required: true },
    attemptCountByQuestionId: {
        type: Map,
        of: Number,
        default: () => new Map(),
    },
    lastAnswerByQuestionId: {
        type: Map,
        of: String,
        default: () => new Map(),
    },
    mistakeCountByConceptTag: {
        type: Map,
        of: Number,
        default: () => new Map(),
    },
    seenConceptTags: {
        type: Map,
        of: Number,
        default: () => new Map(),
    },
    wrongCount: { type: Number, default: 0 },
    almostCount: { type: Number, default: 0 },
    forcedAdvanceCount: { type: Number, default: 0 },
    hintsUsedCount: { type: Number, default: 0 },
    messages: { type: [ChatMessageSchema], default: [] },
    practiceById: {
        type: Map,
        of: mongoose_1.default.Schema.Types.Mixed,
        default: () => new Map(),
    },
    practiceAttempts: {
        type: Map,
        of: Number,
        default: () => new Map(),
    },
    practiceCooldownByQuestionId: {
        type: Map,
        of: Number,
        default: () => new Map(),
    },
    recentConfusions: {
        type: [
            {
                conceptTag: { type: String, required: true },
                timestamp: { type: Date, required: true },
            },
        ],
        default: [],
    },
    manualSupportTurnsLeft: { type: Number, default: 0 },
    lastSupportModeFromProfile: { type: String, default: "auto" },
    forceNoSupport: { type: Boolean, default: false },
}, { timestamps: true });
LessonSessionSchema.index({ userId: 1, language: 1 }, { unique: true });
exports.LessonSessionModel = mongoose_1.default.models.LessonSession || mongoose_1.default.model("LessonSession", LessonSessionSchema);
