//backend/src/ai/__tests__/openaiClient.languageGuard.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.hoisted(() =>
  vi.fn(async () => ({
    output_text: "OK",
  }))
);

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      responses = { create: createMock };
      constructor(_: any) {}
    },
  };
});

describe("openaiClient language + intent guard", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test";
    createMock.mockClear();
    vi.resetModules();
  });

  it("includes Intent and Output language policy in system prompt", async () => {
    const mod = await import("../openaiClient");

    await mod.generateTutorResponse("PROMPT_BODY", "ASK_QUESTION", { language: "en" });

    expect(createMock).toHaveBeenCalledTimes(1);
    const req = (createMock as any).mock.calls[0][0];

    const system = req.input[0].content as string;
    expect(system).toMatch(/POLICY/i);
    expect(system).toMatch(/Intent:\s*ASK_QUESTION/i);
    expect(system).toMatch(/Output language must be:\s*en/i);
  });
});
