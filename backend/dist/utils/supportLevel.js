"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupportLevel = isSupportLevel;
exports.supportLevelFromNumber = supportLevelFromNumber;
exports.normalizeSupportLevel = normalizeSupportLevel;
exports.supportLevelToNumber = supportLevelToNumber;
exports.fallbackSupportHint = fallbackSupportHint;
function isSupportLevel(value) {
    return value === "high" || value === "medium" || value === "low";
}
function supportLevelFromNumber(value, fallback = "high") {
    if (!Number.isFinite(value))
        return fallback;
    if (value >= 0.75)
        return "high";
    if (value >= 0.4)
        return "medium";
    return "low";
}
function normalizeSupportLevel(value) {
    if (isSupportLevel(value))
        return value;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n))
        return null;
    return supportLevelFromNumber(n);
}
function supportLevelToNumber(level, fallback = 0.85) {
    switch (level) {
        case "high":
            return 0.85;
        case "medium":
            return 0.55;
        case "low":
            return 0.25;
        default:
            return fallback;
    }
}
function fallbackSupportHint(language) {
    switch (language) {
        case "de":
            return "Versuche die erwartete Struktur.";
        case "es":
            return "Intenta la estructura esperada.";
        case "fr":
            return "Essaie la structure attendue.";
        default:
            return "Try the expected structure.";
    }
}
