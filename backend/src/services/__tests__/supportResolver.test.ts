import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSupportText } from "../supportResolver";
import { generateTutorResponse } from "../../ai/openaiClient";
import { getPackEntry } from "../../content/instructionPacks/index";

vi.mock("../../ai/openaiClient", () => ({
  generateTutorResponse: vi.fn(),
}));

describe("resolveSupportText", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns none when includeSupport is false", async () => {
    const res = await resolveSupportText({
      targetLanguage: "en",
      instructionLanguage: "en",
      supportLevel: 0.5,
      includeSupport: false,
      supportCharLimit: 200,
      eventType: "HINT_AUTO",
      conceptTag: "greetings_hello",
    });

    expect(res.supportText).toBe("");
    expect(res.source).toBe("none");
    expect(generateTutorResponse).not.toHaveBeenCalled();
  });

  it("uses pack hint for HINT events", async () => {
    const entry = getPackEntry("en", "a1.poss.my");
    expect(entry).not.toBeNull();

    const res = await resolveSupportText({
      targetLanguage: "en",
      instructionLanguage: "en",
      supportLevel: 0.8,
      includeSupport: true,
      supportCharLimit: 200,
      eventType: "HINT_AUTO",
      conceptTag: "a1.poss.my",
    });

    expect(res.source).toBe("pack");
    expect(res.supportText).toBe(entry?.hint?.[0] ?? "");
    expect(generateTutorResponse).not.toHaveBeenCalled();
  });

  it("uses explanation for FORCED_ADVANCE", async () => {
    const entry = getPackEntry("en", "a1.q.where_does");
    expect(entry).not.toBeNull();

    const res = await resolveSupportText({
      targetLanguage: "en",
      instructionLanguage: "en",
      supportLevel: 0.8,
      includeSupport: true,
      supportCharLimit: 200,
      eventType: "FORCED_ADVANCE",
      conceptTag: "a1.q.where_does",
    });

    expect(res.source).toBe("pack");
    expect(res.supportText).toBe(entry?.explanation ?? "");
    expect(generateTutorResponse).not.toHaveBeenCalled();
  });

  it("uses feedbackWrong for WRONG_FEEDBACK", async () => {
    const entry = getPackEntry("en", "a1.present.like_i");
    expect(entry).not.toBeNull();

    const res = await resolveSupportText({
      targetLanguage: "en",
      instructionLanguage: "en",
      supportLevel: 0.8,
      includeSupport: true,
      supportCharLimit: 200,
      eventType: "WRONG_FEEDBACK",
      conceptTag: "a1.present.like_i",
    });

    expect(res.source).toBe("pack");
    expect(res.supportText).toBe(entry?.feedbackWrong ?? "");
    expect(generateTutorResponse).not.toHaveBeenCalled();
  });

  it("uses feedbackAlmost for ALMOST_FEEDBACK", async () => {
    const entry = getPackEntry("en", "a1.present.like_i");
    expect(entry).not.toBeNull();

    const res = await resolveSupportText({
      targetLanguage: "en",
      instructionLanguage: "en",
      supportLevel: 0.8,
      includeSupport: true,
      supportCharLimit: 200,
      eventType: "ALMOST_FEEDBACK",
      conceptTag: "a1.present.like_i",
    });

    expect(res.source).toBe("pack");
    expect(res.supportText).toBe(entry?.feedbackAlmost ?? "");
    expect(generateTutorResponse).not.toHaveBeenCalled();
  });

  it("uses AI when pack is missing", async () => {
    (generateTutorResponse as any).mockResolvedValueOnce({
      primaryText: "",
      supportText: "Short help line.",
    });

    const res = await resolveSupportText({
      targetLanguage: "en",
      instructionLanguage: "en",
      supportLevel: 0.6,
      includeSupport: true,
      supportCharLimit: 200,
      eventType: "HINT_AUTO",
      conceptTag: "missing_tag",
    });

    expect(res.source).toBe("ai");
    expect(res.supportText).toBe("Short help line.");
    expect(generateTutorResponse).toHaveBeenCalledTimes(1);
  });

  it("falls back when AI output is invalid", async () => {
    (generateTutorResponse as any).mockResolvedValueOnce({
      primaryText: "",
      supportText: "x".repeat(500),
    });

    const res = await resolveSupportText({
      targetLanguage: "en",
      instructionLanguage: "en",
      supportLevel: 0.6,
      includeSupport: true,
      supportCharLimit: 120,
      eventType: "HINT_AUTO",
      conceptTag: "missing_tag",
    });

    expect(res.source).toBe("fallback");
    expect(res.supportText.length).toBeLessThanOrEqual(120);
    expect(res.supportText).not.toBe("x".repeat(500));
  });

  it("falls back to pack when available", async () => {
    (generateTutorResponse as any).mockResolvedValueOnce({
      primaryText: "",
      supportText: "x".repeat(500),
    });

    const res = await resolveSupportText({
      targetLanguage: "en",
      instructionLanguage: "en",
      supportLevel: 0.6,
      includeSupport: true,
      supportCharLimit: 120,
      eventType: "UNSPECIFIED",
      conceptTag: "greetings_hello",
    });

    expect(res.source).toBe("fallback");
    expect(res.supportText).toBe('\"Hello\" is a standard greeting.');
  });
});
