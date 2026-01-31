"use strict";
// backend/src/ai/calmToneGuard.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.violatesCalmTone = violatesCalmTone;
function norm(s) {
    return String(s || "").trim();
}
/**
 * Deterministic calm tone enforcement.
 * Keep patterns narrow to avoid false positives in normal lesson content.
 */
const CALM_TONE_VIOLATIONS = [
    // Shame / judgment
    /\b(stupid|dumb|idiot|pathetic|embarrassing)\b/i,
    /\b(terrible|awful|horrible)\b/i,
    // Harsh "wrong" phrasing (avoid banning the word "wrong" in general)
    /\b(that'?s|that is|you(?:'re| are))\s+wrong\b/i,
    /\bwrong!\b/i,
    // Pressure / rush
    /\b(hurry up|asap|right now|immediately)\b/i,
    /\b(don't waste time|no excuses)\b/i,
    // Gamification / grading vibes (phrases, not generic "points")
    /\b(streak|xp|badge|leaderboard)\b/i,
    /\b(your score)\b/i,
    /\b(score:)\b/i,
    /\byou (?:got|earned|scored)\s+\d+\s*(?:points?|xp)\b/i,
];
function violatesCalmTone(text) {
    const t = norm(text);
    if (!t)
        return false;
    for (const re of CALM_TONE_VIOLATIONS) {
        if (re.test(t))
            return true;
    }
    return false;
}
