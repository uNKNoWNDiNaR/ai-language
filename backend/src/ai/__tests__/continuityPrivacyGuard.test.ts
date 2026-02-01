// backend/src/ai/__tests__/continuityPrivacyGuard.test.ts

import { describe, it, expect } from "vitest";
import { violatesContinuityPrivacy } from "../continuityPrivacyGuard";

describe("continuityPrivacyGuard", () => {
  it("flags explicit tracking/history phrasing", () => {
    expect(violatesContinuityPrivacy("I've been tracking your mistakes.")).toBe(true);
    expect(violatesContinuityPrivacy("Based on your history, you struggle with articles.")).toBe(true);
    expect(violatesContinuityPrivacy("Last time you answered, you wrote...")).toBe(true);
    expect(violatesContinuityPrivacy("This is your third attempt.")).toBe(true);
  });

  it("does not flag normal teaching language", () => {
    expect(violatesContinuityPrivacy("Remember to put the verb in position 2.")).toBe(false);
    expect(violatesContinuityPrivacy("Let's focus on word order.")).toBe(false);
    expect(violatesContinuityPrivacy("Nice try — here's a small hint.")).toBe(false);
  });

  it("does not block generic 'remember' imperatives", () => {
    expect(violatesContinuityPrivacy("Remember to add an article.")).toBe(false);
    expect(violatesContinuityPrivacy("Remember: short sentences are okay.")).toBe(false);
  });
});
