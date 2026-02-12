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

    expect(prompt).toMatch(/LANGUAGE RULES:/i);
    expect(prompt).toMatch(/lesson language is "en"/i);
    expect(prompt).toMatch(/primaryText MUST be in the lesson language/i);
    expect(prompt).toMatch(/Never translate tokens inside quotes/i);
    expect(prompt).toMatch(/do NOT introduce other languages/i);
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

    const prompt = buildTutorPrompt(session, "ASK_QUESTION" as any, "Q?", {
      instructionLanguage: "de",
      supportLevel: "high",
    });

    expect(prompt).toMatch(/SUPPORT RULES:/i);
    expect(prompt).toMatch(/supportLanguageStyle/i);
    expect(prompt).toMatch(/Support:/i);
    expect(prompt).toMatch(/Never translate tokens inside quotes/i);
  });
});
