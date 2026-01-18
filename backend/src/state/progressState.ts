// backend/src/state/progressState.ts

import mongoose from "mongoose";

export type ProgressStatus = "not_started" | "in_progress" | "completed" | "needs_review";

const ProgressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    language: { type: String, required: true },
    lessonId: { type: String, required: true },

    status: { type: String, required: true, default: "not_started" },
    currentQuestionIndex: { type: Number, default: 0 },
    attemptsTotal: { type: Number, default: 0 },

    // Optional: questionId -> mistakes count
    mistakesByQuestion: { type: Map, of: Number, default: {} },

    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ProgressSchema.index({ userId: 1, language: 1, lessonId: 1 }, { unique: true });

export const LessonProgressModel =
  mongoose.models.LessonProgress || mongoose.model("LessonProgress", ProgressSchema);
