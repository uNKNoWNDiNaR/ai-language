"use strict";
//backend/src/config/featureFlags.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPracticeGenEnabled = isPracticeGenEnabled;
exports.isInstructionLanguageEnabled = isInstructionLanguageEnabled;
function isPracticeGenEnabled() {
    return String(process.env.PRACTICE_GEN_ENABLED || "").toLowerCase() === "true";
}
function isInstructionLanguageEnabled() {
    const raw = String(process.env.FEATURE_INSTRUCTION_LANGUAGE || "").toLowerCase().trim();
    return raw === "1" || raw === "true";
}
