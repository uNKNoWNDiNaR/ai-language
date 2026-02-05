// backend/src/ai/__tests__/tutorOutputGuard.length.test.ts

import { describe, it, expect } from "vitest";
import { isTutorMessageAcceptable } from "../tutorOutputGuard";

describe("tutorOutputGuard length enforcement", () => {
  it("rejects messages longer than 1200 characters", () => {
    const longMessage = "a".repeat(1201);

    const ok = isTutorMessageAcceptable({
      intent: "ASK_QUESTION",
      language: "en",
      message: longMessage,
      questionText: "How do you say 'Hello' in English?",
    });

    expect(ok).toBe(false);
  });
});
