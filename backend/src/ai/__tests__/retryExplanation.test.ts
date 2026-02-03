//backend/src/ai/__tests__/retryExplanation.test.ts

import { describe, expect, it } from "vitest";
import { getDeterministicRetryExplanation } from "../staticTutorMessages";

describe("getDeterministicRetryExplanation", () => {
  it("returns empty when depth is short", () => {
    expect(
      getDeterministicRetryExplanation({ attemptCount: 4, depth: "short", reasonCode: "ARTICLE" })
    ).toBe("");
  });

  it("normal depth starts at attempt 3", () => {
    expect(
      getDeterministicRetryExplanation({ attemptCount: 2, depth: "normal", reasonCode: "ARTICLE" })
    ).toBe("");
    expect(
      getDeterministicRetryExplanation({ attemptCount: 3, depth: "normal", reasonCode: "ARTICLE" })
    ).toMatch(/article/i);
  });

  it("detailed depth starts at attempt 2", () => {
    expect(
      getDeterministicRetryExplanation({ attemptCount: 1, depth: "detailed", reasonCode: "WORD_ORDER" })
    ).toBe("");
    expect(
      getDeterministicRetryExplanation({ attemptCount: 2, depth: "detailed", reasonCode: "WORD_ORDER" })
    ).toMatch(/word order/i);
  });
});
