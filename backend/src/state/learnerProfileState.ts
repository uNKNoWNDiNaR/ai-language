import mongoose from "mongoose";

const LearnerProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    language: { type: String, required: true },

    // Teaching profile v2 (Phase 7.3)
    // NOTE: These are intentionally bounded + privacy-safe.
    pace: { type: String, enum: ["slow", "normal"], default: "normal" },
    explanationDepth: {
      type: String,
      enum: ["short", "normal", "detailed"],
      default: "normal",
    },
    // Sliding window of the last few mistake tags (derived, no PII)
    topMistakeTags: { type: [String], default: [] },
    // Sliding window of recent confusion concept tags (bounded)
    recentConfusions: {
      type: [
        {
          conceptTag: { type: String, required: true },
          timestamp: { type: Date, required: true },
        },
      ],
      default: [],
    },

    mistakeCountsByReason: { type: Object, default: {} },
    mistakeCountsByConcept: { type: Object, default: {} },
    forcedAdvanceCount: { type: Number, default: 0 },
    attemptsTotal: { type: Number, default: 0 },
    practiceAttemptsTotal: { type: Number, default: 0 },
    lastActiveAt: { type: Date },
  },
  { timestamps: true }
);

LearnerProfileSchema.index({ userId: 1, language: 1 }, { unique: true });

export const LearnerProfileModel =
  mongoose.models.LearnerProfile || mongoose.model("LearnerProfile", LearnerProfileSchema);
