"use strict";
// backend/src/ai/continuityPrivacyGuard.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.violatesContinuityPrivacy = violatesContinuityPrivacy;
const PRIVACY_VIOLATIONS = [
    // Explicitly referencing tracking/history or long-term memory
    /\b(i(?:'ve| have)\s+been\s+tracking)\b/i,
    /\b(based\s+on\s+your\s+history)\b/i,
    /\b(last\s+time\s+you)\b/i,
    /\b(previously\s+you)\b/i,
    /\b(you\s+always)\b/i,
    /\b(you\s+often)\b/i,
    /\b(you\s+tend\s+to)\b/i,
    /\b(i\s+remember\s+that)\b/i,
    /\b(i\s+noticed\s+before)\b/i,
    // Mentioning attempt counts directly
    /\b(this is your\s+(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)\s+attempt)\b/i,
    /\b(you(?:'ve| have)\s+tried\s+(?:\d+|one|two|three|four|five)\s+times)\b/i,
    /\b(on your\s+(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)\s+attempt)\b/i,
    // Expanded “attempt count” phrasing (BITE 4.5)
    /\b(?:this is|that's|that is|it is)\s+your\s+(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)\s+(?:try|tries)\b/i,
    /\b(on your\s+(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)\s+(?:try|tries))\b/i,
    /\b(after\s+(?:\d+|one|two|three|four|five)\s+(?:tries|attempts))\b/i,
    /\b(you(?:'ve| have)\s+(?:made|had|used)\s+(?:\d+|one|two|three|four|five)\s+(?:attempts|tries))\b/i,
];
function violatesContinuityPrivacy(message) {
    const text = (message || "").trim();
    if (!text)
        return false;
    return PRIVACY_VIOLATIONS.some((re) => re.test(text));
}
