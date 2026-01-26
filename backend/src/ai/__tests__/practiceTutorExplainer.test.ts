//backend/src/ai/__tests__/practiceTutorExplainer.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../openaiClient", () => ({
  generateTutorResponse: vi.fn(),
}));

import { generateTutorResponse } from "../openaiClient";
import { explainPracticeResult } from "../practiceTutorEplainer";

describe("explanaPracticeResult", () => {
    beforeEach(() => {
  vi.clearAllMocks();
 });


  it("returns null if model output is too long", async () => {
    (generateTutorResponse as any).mockResolvedValueOnce("x".repeat(400));
    const res = await explainPracticeResult({
      language: "en",
      result: "correct",
      expectedAnswer: "Hello",
      userAnswer: "Hello",
    });
    expect(res).toBeNull();
  });

  it("returns null if model output contains grading contamination", async () => {
    (generateTutorResponse as any).mockResolvedValueOnce("Acceptable answers include: Hello, Hi.");
    const res = await explainPracticeResult({
      language: "en",
      result: "wrong",
      expectedAnswer: "Hello",
      userAnswer: "Bonjour",
    });
    expect(res).toBeNull();
  });

  it("returns cleaned short explanation", async () => {
    (generateTutorResponse as any).mockResolvedValueOnce("Good — ‘Hello’ is the standard greeting.");
    const res = await explainPracticeResult({
      language: "en",
      result: "correct",
      expectedAnswer: "Hello",
      userAnswer: "Hello",
    });
    expect(res).toBe("Good — ‘Hello’ is the standard greeting.");
  });

  it("calls generateTutorResponse with EXPLAIN_PRACTICE_RESULT intent and low-cost opts", async () => {
    (generateTutorResponse as any).mockResolvedValueOnce("Short explanation.");

    await explainPracticeResult({
        language: "en",
        result: "correct",
        expectedAnswer: "Hello",
        userAnswer: "Hello",
    });

    expect(generateTutorResponse).toHaveBeenCalledTimes(1);

    const args = (generateTutorResponse as any).mock.calls[0];
    // args: [prompt, intent, opts]
    expect(args[1]).toBe("EXPLAIN_PRACTICE_RESULT");
    expect(args[2]).toEqual({ temperature: 0.3, maxOutputTokens: 120 });
    });

});
