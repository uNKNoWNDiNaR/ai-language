"use strict";
// backend/src/state/learnerProfileState.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearnerProfileModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const LearnerProfileSchema = new mongoose_1.default.Schema({
    userId: { type: String, required: true },
    language: { type: String, required: true },
    mistakeCountsByReason: {
        type: Map,
        of: Number,
        default: () => new Map(),
    },
    forcedAdvanceCount: { type: Number, default: 0 },
    attemptsTotal: { type: Number, default: 0 },
    practiceAttemptsTotal: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: Date.now },
}, { timestamps: true });
LearnerProfileSchema.index({ userId: 1, language: 1 }, { unique: true });
exports.LearnerProfileModel = mongoose_1.default.models.LearnerProfile || mongoose_1.default.model("LearnerProfile", LearnerProfileSchema);
