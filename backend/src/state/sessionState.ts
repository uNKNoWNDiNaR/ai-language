// src/sessionState.ts

import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const LessonSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    lessonId: String,
    language: { type: String, required: true },
    state: { type: String, required: true },

    // Legacy global attempts (keep for backward compatibility)
    attempts: { type: Number, required: true },
    maxAttempts: { type: Number, required: true },

    currentQuestionIndex: { type: Number, required: true },
    messages: { type: [ChatMessageSchema], default: [] },

    // Phase 2.2: per-question attempt counts + last answer (optional, backward compatible)
    attemptCountByQuestionId: { type: Map, of: Number, default: {} },
    lastAnswerByQuestionId: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

export const LessonSessionModel =
  mongoose.models.LessonSession || mongoose.model("LessonSession", LessonSessionSchema);
