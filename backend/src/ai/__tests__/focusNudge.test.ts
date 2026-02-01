// backend/src/ai/__tests__/focusNudge.test.ts

import { describe, it, expect } from "vitest";
import { getFocusNudge } from "../staticTutorMessages";

describe("getFocusNudge", () => {
  it("returns calm nudges for known reasons", () => {
    expect(getFocusNudge("WORD_ORDER")).toMatch(/word order/i);
    expect(getFocusNudge("ARTICLE")).toMatch(/article/i);
    expect(getFocusNudge("TYPO")).toMatch(/spelling/i);
  });

  it("returns empty for unknown/blank reasons", () => {
    expect(getFocusNudge("")).toBe("");
    expect(getFocusNudge(null)).toBe("");
    expect(getFocusNudge("UNKNOWN")).toBe("");
  });

  it("does not mention tracking or gamification", () => {
    const combined = [
      getFocusNudge("WORD_ORDER"),
      getFocusNudge("ARTICLE"),
      getFocusNudge("TYPO"),
      getFocusNudge("WRONG_LANGUAGE"),
      getFocusNudge("MISSING_SLOT"),
    ].join(" ");

    expect(combined).not.toMatch(/track|tracking|history|last time/i);
    expect(combined).not.toMatch(/score|points|xp|streak|badge|leaderboard/i);
  });
});
