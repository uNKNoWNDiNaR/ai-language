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
    sessionId: { type: String },
    supportLevel: { type: String },
    appVersion: { type: String },
    clientTimestamp: { type: String },

    feedbackType: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    quickTags: [{ type: String }],
    freeText: { type: String },
    forcedChoice: {
      returnTomorrow: { type: String },
      clarity: { type: String },
      pace: { type: String },
      answerChecking: { type: String },
      frictionType: { type: String },
    },
    testerContext: {
      version: { type: Number },
      selfReportedLevel: { type: String },
      goal: { type: String },
      updatedAtISO: { type: String },
    },

    questionId: { type: String },
    attemptsOnQuestion: { type: Number },
    promptStyle: { type: String },
    evaluationResult: { type: String },
    reasonCode: { type: String },
  },
  { timestamps: true },
);

FeedbackSchema.index({ userAnonId: 1, createdAt: -1 });
FeedbackSchema.index({ lessonId: 1, conceptTag: 1, createdAt: -1 });

export const LessonFeedbackModel =
  mongoose.models.LessonFeedback || mongoose.model("LessonFeedback", FeedbackSchema);
