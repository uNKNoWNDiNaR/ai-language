// backend/src/ai/__tests__/continuityPrivacyGuard.test.ts

import { describe, it, expect } from "vitest";
import { violatesContinuityPrivacy } from "../continuityPrivacyGuard";

describe("continuityPrivacyGuard", () => {
  it("flags explicit tracking/history phrasing", () => {
    expect(violatesContinuityPrivacy("I've been tracking your mistakes.")).toBe(true);
    expect(violatesContinuityPrivacy("Based on your history, you struggle with articles.")).toBe(true);
    expect(violatesContinuityPrivacy("Last time you made the same mistake.")).toBe(true);

    // Neutral teaching phrasing should be allowed
    expect(violatesContinuityPrivacy("Let's try a simpler example.")).toBe(false);
  });

  it("flags attempt-count phrasing variants (BITE 4.5)", () => {
    // Existing attempt-count patterns
    expect(violatesContinuityPrivacy("This is your third attempt.")).toBe(true);
    expect(violatesContinuityPrivacy("You've tried 3 times already.")).toBe(true);
    expect(violatesContinuityPrivacy("On your 3rd attempt, here's a hint.")).toBe(true);

    // New variants: try/tries + number words
    expect(violatesContinuityPrivacy("You've tried three times already.")).toBe(true);
    expect(violatesContinuityPrivacy("That's your 3rd try.")).toBe(true);
    expect(violatesContinuityPrivacy("On your second try, you're closer.")).toBe(true);
    expect(violatesContinuityPrivacy("After 3 tries, let's move on.")).toBe(true);
    expect(violatesContinuityPrivacy("You've made 4 attempts on this.")).toBe(true);

    // Should NOT be flagged
    expect(violatesContinuityPrivacy("Try again.")).toBe(false);
  });
});
