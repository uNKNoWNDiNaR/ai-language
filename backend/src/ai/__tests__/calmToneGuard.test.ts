// backend/src/ai/__tests__/calmToneGuard.test.ts

import { describe, it, expect } from "vitest";
import { violatesCalmTone } from "../calmToneGuard";
import { isTutorMessageAcceptable } from "../tutorOutputGuard";

describe("calmToneGuard", () => {
  it("flags shame / pressure / gamification phrasing", () => {
    expect(violatesCalmTone("Hurry up — that's wrong.")).toBe(true);
    expect(violatesCalmTone("You got 10 points! Great job.")).toBe(true);
    expect(violatesCalmTone("Your score is 9/10.")).toBe(true);
  });

  it("does not flag normal teaching content", () => {
    expect(violatesCalmTone("Nice try — let's go again.")).toBe(false);
    expect(violatesCalmTone("How do you say 'points' in English?")).toBe(false);
  });

  it("causes tutorOutputGuard to reject messages that violate calm tone", () => {
    const q = "How do you say 'Hello' in English?";
    const ok = isTutorMessageAcceptable({
      intent: "ASK_QUESTION",
      language: "en",
      message: `Let's begin.\n${q}`,
      questionText: q,
    });
    expect(ok).toBe(true);

    const bad = isTutorMessageAcceptable({
      intent: "ASK_QUESTION",
      language: "en",
      message: `Let's begin.\nHurry up.\n${q}`,
      questionText: q,
    });
    expect(bad).toBe(false);
  });
});
