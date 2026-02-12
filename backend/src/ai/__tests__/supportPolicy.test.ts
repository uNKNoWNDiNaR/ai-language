import { describe, it, expect } from "vitest";
import { computeSupportPolicy } from "../supportPolicy";

describe("supportPolicy", () => {
  it("option A (high) is always-on for question intents", () => {
    const res = computeSupportPolicy({
      intent: "ASK_QUESTION" as any,
      pace: "normal",
      explanationDepth: "normal",
      supportLevel: "high",
      instructionLanguage: "de",
      lessonLanguage: "en",
      attemptCount: 1,
      isFirstQuestion: false,
    });

    expect(res.supportMode).toBe("A");
    expect(res.includeSupport).toBe(true);
    expect(res.supportLanguageStyle).toBe("il_only");
    expect(res.maxSupportBullets).toBe(1);
  });

  it("option A uses tl_only when IL matches TL", () => {
    const res = computeSupportPolicy({
      intent: "ASK_QUESTION" as any,
      pace: "slow",
      explanationDepth: "normal",
      supportLevel: "high",
      instructionLanguage: "en",
      lessonLanguage: "en",
      attemptCount: 1,
      isFirstQuestion: true,
    });

    expect(res.supportMode).toBe("A");
    expect(res.includeSupport).toBe(true);
    expect(res.supportLanguageStyle).toBe("tl_only");
    expect(res.maxSupportBullets).toBe(1);
  });

  it("option B (medium) does not add support before any attempt", () => {
    const res = computeSupportPolicy({
      intent: "ASK_QUESTION" as any,
      pace: "normal",
      explanationDepth: "normal",
      supportLevel: "medium",
      instructionLanguage: "de",
      lessonLanguage: "en",
      attemptCount: 1,
      isFirstQuestion: true,
    });

    expect(res.supportMode).toBe("B");
    expect(res.includeSupport).toBe(false);
    expect(res.supportLanguageStyle).toBe("mixed");
    expect(res.maxSupportBullets).toBe(1);
  });

  it("option B (medium) retry support triggers at attempt >= 2", () => {
    const res = computeSupportPolicy({
      intent: "ENCOURAGE_RETRY" as any,
      pace: "normal",
      explanationDepth: "normal",
      supportLevel: "medium",
      instructionLanguage: "de",
      lessonLanguage: "en",
      attemptCount: 2,
      isFirstQuestion: false,
    });

    expect(res.includeSupport).toBe(true);
  });

  it("option B (low) retry support triggers at attempt >= 3", () => {
    const res = computeSupportPolicy({
      intent: "ENCOURAGE_RETRY" as any,
      pace: "normal",
      explanationDepth: "normal",
      supportLevel: "low",
      instructionLanguage: "de",
      lessonLanguage: "en",
      attemptCount: 2,
      isFirstQuestion: false,
    });

    expect(res.includeSupport).toBe(false);

    const res2 = computeSupportPolicy({
      intent: "ENCOURAGE_RETRY" as any,
      pace: "normal",
      explanationDepth: "normal",
      supportLevel: "low",
      instructionLanguage: "de",
      lessonLanguage: "en",
      attemptCount: 3,
      isFirstQuestion: false,
    });

    expect(res2.includeSupport).toBe(true);
    expect(res2.supportLanguageStyle).toBe("tl_only");
  });

  it("forced advance always includes support for medium/low", () => {
    const res = computeSupportPolicy({
      intent: "FORCED_ADVANCE" as any,
      pace: "normal",
      explanationDepth: "normal",
      supportLevel: "low",
      instructionLanguage: "de",
      lessonLanguage: "en",
      attemptCount: 4,
      isFirstQuestion: false,
    });

    expect(res.includeSupport).toBe(true);
  });
});
