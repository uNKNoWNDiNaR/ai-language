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
    userId: { type: String, required: true, unique: true },
    lessonId: String,
    language: { type: String, required: true },
    state: { type: String, required: true },
    attempts: { type: Number, required: true },
    maxAttempts: { type: Number, required: true },
    currentQuestionIndex: { type: Number, required: true },
    attemptCountByQuestionId: {
        type: Map,
        of: Number,
        default: () => new Map()
    },
    lastAnswerByQuestionId: {
        type: Map,
        of: String,
        default: () => new Map()
    },
    messages: { type: [ChatMessageSchema], default: [] },
}, { timestamps: true });
exports.LessonSessionModel = mongoose_1.default.models.LessonSession || mongoose_1.default.model("LessonSession", LessonSessionSchema);
