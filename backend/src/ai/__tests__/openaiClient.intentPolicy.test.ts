// backend/src/ai/__tests__/openaiClient.intentPolicy.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.hoisted(() => {
  const fn = vi.fn<(req: any) => Promise<{ output_text: string }>>();
  fn.mockImplementation(async (_req: any) => ({ output_text: "OK" }));
  return fn;
});

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      public responses = { create: createMock };
      constructor(_: any) {}
    },
  };
});

describe("openaiClient intent policy defaults", () => {
  beforeEach(() => {
    createMock.mockClear();
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("applies defaults for ASK_QUESTION when opts not provided", async () => {
    const mod = await import("../openaiClient");
    await mod.generateTutorResponse("PROMPT", "ASK_QUESTION" as any);

    expect(createMock).toHaveBeenCalledTimes(1);

    const req = createMock.mock.calls.at(0)?.[0];
    expect(req).toBeTruthy();

    expect((req as any).temperature).toBe(0.2);
    expect((req as any).max_output_tokens).toBe(140);
  });

  it("applies defaults for FORCED_ADVANCE when opts not provided", async () => {
    const mod = await import("../openaiClient");
    await mod.generateTutorResponse("PROMPT", "FORCED_ADVANCE" as any);

    expect(createMock).toHaveBeenCalledTimes(1);

    const req = createMock.mock.calls.at(0)?.[0];
    expect(req).toBeTruthy();

    expect((req as any).temperature).toBe(0.1);
    expect((req as any).max_output_tokens).toBe(200);
  });

  it("opts override defaults", async () => {
    const mod = await import("../openaiClient");
    await mod.generateTutorResponse("PROMPT", "ASK_QUESTION" as any, {
      temperature: 0.9,
      maxOutputTokens: 999,
    });

    expect(createMock).toHaveBeenCalledTimes(1);

    const req = createMock.mock.calls.at(0)?.[0];
    expect(req).toBeTruthy();

    expect((req as any).temperature).toBe(0.9);
    expect((req as any).max_output_tokens).toBe(999);
  });
});
