// backend/src/state/feedbackState.ts

import mongoose from "mongoose";

const FeedbackSchema = new mongoose.Schema(
  {
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

    screen: { type: String },
    intent: { type: String },
    crowdedRating: { type: String },
    feltBest: [{ type: String }],
    improveText: { type: String },

    targetLanguage: { type: String },
    instructionLanguage: { type: String },
    sessionKey: { type: String },
    appVersion: { type: String },
    clientTimestamp: { type: String },
  },
  { timestamps: true },
);

FeedbackSchema.index({ userAnonId: 1, createdAt: -1 });
FeedbackSchema.index({ lessonId: 1, conceptTag: 1, createdAt: -1 });

export const LessonFeedbackModel =
  mongoose.models.LessonFeedback || mongoose.model("LessonFeedback", FeedbackSchema);
