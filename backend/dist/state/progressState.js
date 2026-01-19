"use strict";
// backend/src/state/progressState.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LessonProgressModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ProgressSchema = new mongoose_1.default.Schema({
    userId: { type: String, required: true },
    language: { type: String, required: true },
    lessonId: { type: String, required: true },
    status: { type: String, required: true, default: "not_started" },
    currentQuestionIndex: { type: Number, default: 0 },
    attemptsTotal: { type: Number, default: 0 },
    // Optional: questionId -> mistakes count
    mistakesByQuestion: { type: Map, of: Number, default: {} },
    lastActiveAt: { type: Date, default: Date.now },
}, { timestamps: true });
ProgressSchema.index({ userId: 1, language: 1, lessonId: 1 }, { unique: true });
exports.LessonProgressModel = mongoose_1.default.models.LessonProgress || mongoose_1.default.model("LessonProgress", ProgressSchema);
