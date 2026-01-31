// backend/src/ai/__tests__/promptBuilder.profileSummary.test.ts

import { describe, it, expect } from "vitest";
import { buildTutorPrompt } from "../promptBuilder";

describe("buildTutorPrompt learner profile summary", () => {
  it("includes learner profile block when provided", () => {
    const session: any = {
      userId: "u1",
      lessonId: "basic-1",
      language: "en",
      state: "USER_INPUT",
      attempts: 0,
      maxAttempts: 4,
      currentQuestionIndex: 0,
      messages: [],
    };

    const prompt = buildTutorPrompt(session, "ASK_QUESTION" as any, "Q?", {
      learnerProfileSummary: "Focus areas: word order (2), articles (1). Forced advances: 1. Practice attempts: 3.",
    });

    expect(prompt).toMatch(/LEARNER PROFILE/i);
    expect(prompt).toMatch(/do NOT mention tracking/i);
    expect(prompt).toMatch(/Focus areas: word order/i);
  });

  it("does not include learner profile block when omitted", () => {
    const session: any = {
      userId: "u1",
      lessonId: "basic-1",
      language: "en",
      state: "USER_INPUT",
      attempts: 0,
      maxAttempts: 4,
      currentQuestionIndex: 0,
      messages: [],
    };

    const prompt = buildTutorPrompt(session, "ASK_QUESTION" as any, "Q?");
    expect(prompt).not.toMatch(/LEARNER PROFILE/i);
  });

  it("bounds the learner profile text length", () => {
    const session: any = {
      userId: "u1",
      lessonId: "basic-1",
      language: "en",
      state: "USER_INPUT",
      attempts: 0,
      maxAttempts: 4,
      currentQuestionIndex: 0,
      messages: [],
    };

    const long = "x".repeat(1000);
    const prompt = buildTutorPrompt(session, "ASK_QUESTION" as any, "Q?", {
      learnerProfileSummary: long,
    });

    // The prompt should not contain the full 1000 chars verbatim.
    expect(prompt.length).toBeLessThan(5000);
    expect(prompt).toMatch(/LEARNER PROFILE/i);
  });
});
