"use strict";
// backend/src/state/feedbackState.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LessonFeedbackModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const FeedbackSchema = new mongoose_1.default.Schema({
    // Privacy-safe identifier (derived server-side from userId)
    userAnonId: { type: String, required: true },
    // Random client-generated id (or generated server-side)
    anonSessionId: { type: String, required: true },
    lessonId: { type: String, required: true },
    language: { type: String, required: true },
    conceptTag: { type: String },
    // Optional context (no PII)
    sessionState: { type: String },
    currentQuestionIndex: { type: Number },
    // Feedback fields
    feltRushed: { type: Boolean },
    helpedUnderstand: { type: Number, min: 1, max: 5 },
    confusedText: { type: String },
}, { timestamps: true });
FeedbackSchema.index({ userAnonId: 1, createdAt: -1 });
FeedbackSchema.index({ lessonId: 1, conceptTag: 1, createdAt: -1 });
exports.LessonFeedbackModel = mongoose_1.default.models.LessonFeedback || mongoose_1.default.model("LessonFeedback", FeedbackSchema);
