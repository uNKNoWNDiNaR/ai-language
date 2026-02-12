import mongoose from "mongoose";

const ReviewItemSchema = new mongoose.Schema(
  {
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
  },
  { _id: false }
);

const ReviewQueueItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    lessonId: { type: String, required: true },
    conceptTag: { type: String, default: "" },
    prompt: { type: String, required: true },
    expected: { type: String, required: false },
    createdAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastResult: { type: String, required: false },
  },
  { _id: false }
);

const LearnerProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    language: { type: String, required: true },

    pace: { type: String, default: "normal" }, // "slow" | "normal"
    explanationDepth: { type: String, default: "normal" }, // "short" | "normal" | "detailed"
    instructionLanguage: { type: String, default: "en" }, // "en" | "de" | "es" | "fr"
    supportLevel: { type: String, default: "high" }, // "high" | "medium" | "low"
    supportMode: { type: String, default: "auto" }, // "auto" | "manual"

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
    reviewQueue: { type: [ReviewQueueItemSchema], default: [] },

    lastSummary: {
      lessonId: { type: String, required: false },
      completedAt: { type: Date, required: false },
      didWell: { type: String, required: false },
      focusNext: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

LearnerProfileSchema.index({ userId: 1, language: 1 }, { unique: true });

export const LearnerProfileModel =
  (mongoose.models?.LearnerProfile as mongoose.Model<any> | undefined) ??
  mongoose.model("LearnerProfile", LearnerProfileSchema);
