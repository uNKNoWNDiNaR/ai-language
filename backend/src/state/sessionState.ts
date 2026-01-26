// src/sessionState.ts

import mongoose, { mongo } from "mongoose";

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

    messages: { type: [ChatMessageSchema], default: []},

    practiceById: { 
      type: Map,
      of: mongoose.Schema.Types.Mixed,
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

  },
  { timestamps: true });

export const LessonSessionModel =
  mongoose.models.LessonSession || mongoose.model("LessonSession", LessonSessionSchema);


