"use strict";
// backend/src/ai/continuityPrivacyGuard.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.violatesContinuityPrivacy = violatesContinuityPrivacy;
function norm(s) {
    return String(s || "").trim();
}
/**
 * Deterministic guard against "creepy continuity" phrasing.
 * Keep patterns narrow to avoid blocking normal teaching language
 * like "Remember to..." (imperative).
 */
const PRIVACY_VIOLATIONS = [
    // Explicit tracking/monitoring/logging
    /\b(i(?:'ve| have)?(?: been)?\s+(?:tracking|monitoring|recording|logging)\b)/i,
    /\b(i(?:'ve| have)?\s+(?:kept|saved)\s+(?:notes|a record)\b)/i,
    // "Based on your history/past sessions/previous attempts"
    /\b(based on (?:your|our)\s+(?:history|past|previous)\b)/i,
    /\b(based on (?:your|our)\s+(?:earlier|previous)\s+(?:sessions|attempts|tries)\b)/i,
    /\b(from (?:your|our)\s+(?:history|past sessions|previous sessions)\b)/i,
    // "Last time you..." / "Earlier you..."
    /\b(last time you\b)/i,
    /\b(earlier you\b)/i,
    /\b(previously you\b)/i,
    // "I remember you/that you/when you..."
    // (avoid blocking "Remember to..." by requiring "I remember")
    /\b(i remember\s+(?:you|that you|when you)\b)/i,
    // Mentioning attempt counts directly
    /\b(this is your\s+(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)\s+attempt)\b/i,
    /\b(you(?:'ve| have)\s+tried\s+\d+\s+times)\b/i,
    /\b(on your\s+(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)\s+attempt)\b/i,
];
function violatesContinuityPrivacy(text) {
    const t = norm(text);
    if (!t)
        return false;
    for (const re of PRIVACY_VIOLATIONS) {
        if (re.test(t))
            return true;
    }
    return false;
}
