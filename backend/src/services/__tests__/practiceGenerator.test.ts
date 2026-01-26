//backend/src/services/__tests__/practiceGenerator.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("generatePracticeItem", () => {
  beforeEach(() => {
    delete process.env.PRACTICE_GEN_ENABLED;
    vi.resetModules();
  });

  function params() {
    return {
      language: "en" as const,
      lessonId: "basic-1",
      sourceQuestionText: "How do you say 'Hello' in English?",
      expectedAnswerRaw: "Hello",
      examples: ["Hello", "Hi"],
      conceptTag: "greetings",
      type: "variation" as const,
    };
  }

  it("flag OFF -> returns fallback and does not call AI", async () => {
    process.env.PRACTICE_GEN_ENABLED = "false";
    const mod = await import("../practiceGenerator");

    const aiClient = { generatePracticeJSON: vi.fn(async () => `{"no":"json"}`) };

    const res = await mod.generatePracticeItem(params(), aiClient, { forceEnabled: false });

    expect(res.source).toBe("fallback");
    expect(aiClient.generatePracticeJSON).not.toHaveBeenCalled();
    expect(res.item.expectedAnswerRaw).toBe("Hello");
    expect(process.env.PRACTICE_GEN_ENABLED).toBe("false")
  });

  it("flag ON + valid AI JSON -> returns ai item", async () => {
    process.env.PRACTICE_GEN_ENABLED = "true";
    const mod = await import("../practiceGenerator");

    const aiClient = {
      generatePracticeJSON: vi.fn(async () =>
        JSON.stringify({
          practiceId: "p-123",
          lessonId: "basic-1",
          language: "en",
          prompt: "Practice: say Hello",
          expectedAnswerRaw: "Hello",
          examples: ["Hello", "Hi"],
          meta: { type: "variation", conceptTag: "greetings" },
        }),
      ),
    };

    const res = await mod.generatePracticeItem(params(), aiClient, { forceEnabled: true });

    expect(res.source).toBe("ai");
    expect(aiClient.generatePracticeJSON).toHaveBeenCalledTimes(1);
    expect(res.item.practiceId).toBe("p-123");
  });

  it("flag ON -> AI prompt includes compact drift rules", async() => {

    process.env.PRACTICE_GEN_ENABLED = "true";
    const mod = await import("../practiceGenerator");

    const aiClient = {
        generatePracticeJSON: vi.fn(async () => {
            return "{}";
        }),
    };

    await mod.generatePracticeItem(params(), aiClient, { forceEnabled: true });

    expect(aiClient.generatePracticeJSON).toHaveBeenCalled();
    const prompt = (aiClient.generatePracticeJSON as any).mock.calls[0][0] as string;

    expect(prompt).toMatch(/\bRULES\b/i);
    expect(prompt).toMatch(/-?\s*prompt language must be\s*en/i);
    expect(prompt).toMatch(/return only valid json/i);
    expect(prompt).toMatch(/don'?t introduce other languages/i);
    expect(prompt).toMatch(/sourceQuestionText\s*\/\s*expectedAnswerRaw\s*\/\s*examples/i);
  });

  it("flag ON + invalid JSON then valid JSON -> retries once and succeeds", async () => {
    process.env.PRACTICE_GEN_ENABLED = "true";
    const mod = await import("../practiceGenerator");

    const aiClient = {
      generatePracticeJSON: vi
        .fn()
        .mockResolvedValueOnce("{not json")
        .mockResolvedValueOnce(
          JSON.stringify({
            practiceId: "p-124",
            lessonId: "basic-1",
            language: "en",
            prompt: "Practice: say Hello",
            expectedAnswerRaw: "Hello",
            meta: { type: "variation", conceptTag: "greetings" },
          }),
        ),
    };

    const res = await mod.generatePracticeItem(params(), aiClient, { forceEnabled: true });
    expect(res.source).toBe("ai");
    expect(aiClient.generatePracticeJSON).toHaveBeenCalledTimes(2);
    expect(res.item.practiceId).toBe("p-124");
  });

  it("flag ON + invalid twice -> falls back", async () => {
    process.env.PRACTICE_GEN_ENABLED = "true";
    const mod = await import("../practiceGenerator");

    const aiClient = {
      generatePracticeJSON: vi.fn(async () => "{still not json"),
    };

    const res = await mod.generatePracticeItem(params(), aiClient, { forceEnabled: true });
    expect(res.source).toBe("fallback");
    expect(aiClient.generatePracticeJSON).toHaveBeenCalledTimes(2);
    expect(res.item.practiceId).toMatch(/^fallback-/);
  });

  it("flag ON + schema-invalid JSON twice -> falls back", async () => {
    process.env.PRACTICE_GEN_ENABLED = "true";
    const mod = await import("../practiceGenerator");

    const aiClient = {
      generatePracticeJSON: vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            practiceId: "p-bad",
            lessonId: "basic-1",
            language: "en",
            prompt: "Practice: say Hello",
            // missing expectedAnswerRaw -> invalid
            meta: { type: "variation", conceptTag: "greetings" },
          }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            practiceId: "p-bad2",
            lessonId: "basic-1",
            language: "en",
            prompt: "Practice: say Hello",
            // still missing expectedAnswerRaw -> invalid again
            meta: { type: "variation", conceptTag: "greetings" },
          }),
        ),
    };

    const res = await mod.generatePracticeItem(params(), aiClient, { forceEnabled: true });
    expect(res.source).toBe("fallback");
    expect(aiClient.generatePracticeJSON).toHaveBeenCalledTimes(2);
  });

  it("flag ON + drifted prompt (foreign token not in context) -> falls back", async () => {
  const mod = await import("../practiceGenerator");

  const aiClient = {
    generatePracticeJSON: vi.fn(async () =>
      JSON.stringify({
        practiceId: "p-drift",
        lessonId: "basic-1",
        language: "en",
        prompt: "What is the English phrase for 'Bonjour'?",
        expectedAnswerRaw: "Hello",
        examples: ["Hello", "Hi"],
        meta: { type: "variation", conceptTag: "greetings" },
      }),
    ),
  };

  const res = await mod.generatePracticeItem(params(), aiClient, { forceEnabled: true });
  expect(res.source).toBe("fallback");
});

});
