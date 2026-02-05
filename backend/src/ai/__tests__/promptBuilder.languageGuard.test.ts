// backend/src/ai/__tests__/promptBuilder.languageGuard.test.ts

// backend/src/ai/__tests__/promptBuilder.languageGuard.test.ts

import { describe, it, expect } from "vitest";
import { buildTutorPrompt } from "../promptBuilder";

describe("buildTutorPrompt language guard", () => {
  it("includes language drift guard rules (en)", () => {
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

    const prompt = buildTutorPrompt(
      session,
      "ASK_QUESTION" as any,
      "How do you say 'Hello' in English?"
    );

    expect(prompt).toMatch(/LANGUAGE GUARD:/i);
    expect(prompt).toMatch(/lesson language is "en"/i);
    expect(prompt).toMatch(/respond ONLY in the lesson language/i);
    expect(prompt).toMatch(/do NOT introduce other languages/i);
    expect(prompt).toMatch(/ONLY quote foreign words/i);
    expect(prompt).toMatch(/do NOT turn the prompt into a translation task/i);
  });

  it("includes instruction language guidance when provided", () => {
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

    const prompt = buildTutorPrompt(
      session,
      "ASK_QUESTION" as any,
      "Q?",
      { instructionLanguage: "de" }
    );

    expect(prompt).toMatch(/INSTRUCTION LANGUAGE:/i);
    expect(prompt).toMatch(/"de"/i);
    expect(prompt).toMatch(/Do NOT use it for tutor messages/i);
  });
});
