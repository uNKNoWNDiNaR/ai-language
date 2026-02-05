import { describe, it, expect } from "vitest";
import { normalizeLanguage, isSupportedLanguage } from "../instructionLanguage";

describe("instructionLanguage utils", () => {
  it("rejects invalid values", () => {
    expect(normalizeLanguage("jp")).toBeNull();
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage(123)).toBeNull();
    expect(isSupportedLanguage("it")).toBe(false);
  });

  it("normalizes supported values", () => {
    expect(normalizeLanguage("EN")).toBe("en");
    expect(normalizeLanguage("de")).toBe("de");
    expect(normalizeLanguage(" Es ")).toBe("es");
    expect(isSupportedLanguage("fr")).toBe(true);
  });
});
