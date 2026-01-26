"use strict";
//backend/src/config/featureFlags.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPracticeGenEnabled = isPracticeGenEnabled;
function isPracticeGenEnabled() {
    return String(process.env.PRACTICE_GEN_ENABLED || "").toLowerCase() === "true";
}
