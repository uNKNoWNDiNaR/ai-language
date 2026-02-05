"use strict";
// backend/src/utils/instructionLanguage.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupportedLanguage = isSupportedLanguage;
exports.normalizeLanguage = normalizeLanguage;
function isSupportedLanguage(value) {
    return value === "en" || value === "de" || value === "es" || value === "fr";
}
function normalizeLanguage(value) {
    if (typeof value !== "string")
        return null;
    const t = value.trim().toLowerCase();
    return isSupportedLanguage(t) ? t : null;
}
