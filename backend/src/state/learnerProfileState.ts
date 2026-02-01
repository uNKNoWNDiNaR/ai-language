// backend/src/state/learnerProfileState.ts

import mongoose from "mongoose";

const LearnerProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    language: { type: String, required: true },

    mistakeCountsByReason: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },

    mistakeCountsByConcept: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },


    forcedAdvanceCount: { type: Number, default: 0 },
    attemptsTotal: { type: Number, default: 0 },
    practiceAttemptsTotal: { type: Number, default: 0 },

    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

LearnerProfileSchema.index({ userId: 1, language: 1 }, { unique: true });

export const LearnerProfileModel =
  mongoose.models.LearnerProfile || mongoose.model("LearnerProfile", LearnerProfileSchema);
