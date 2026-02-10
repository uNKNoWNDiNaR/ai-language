import { describe, it, expect } from "vitest";
import {
  validatePrimaryLanguage,
  validateSupportLanguage,
  validateSupportLength,
  validateJsonShape,
} from "../tutorOutputGuard";

describe("tutorOutputGuard supportLevel validation", () => {
  it("primaryText must match target language guard", () => {
    expect(validatePrimaryLanguage("Let's begin.", "en")).toBe(true);
    expect(validatePrimaryLanguage("This is English about German.", "en")).toBe(false);
  });

  it("supportText must match instruction language guard", () => {
    expect(validateSupportLanguage("Erklär es bitte kurz.", "de")).toBe(true);
    expect(validateSupportLanguage("This is English.", "de")).toBe(false);
  });

  it("enforces supportText length caps by support level", () => {
    const long = "a".repeat(300);
    expect(validateSupportLength(long, 0.9)).toBe(false);
    expect(validateSupportLength("a".repeat(200), 0.9)).toBe(true);

    expect(validateSupportLength("a".repeat(210), 0.6)).toBe(false);
    expect(validateSupportLength("a".repeat(180), 0.6)).toBe(true);

    expect(validateSupportLength("a".repeat(130), 0.2)).toBe(false);
    expect(validateSupportLength("a".repeat(100), 0.2)).toBe(true);

    expect(validateSupportLength("a".repeat(45), 40)).toBe(false);
    expect(validateSupportLength("a".repeat(35), 40)).toBe(true);
  });

  it("validates tutor JSON shape", () => {
    expect(validateJsonShape({ primaryText: "Hi", supportText: "" })).toBe(true);
    expect(validateJsonShape({ primaryText: "Hi" })).toBe(false);
    expect(validateJsonShape("Hi")).toBe(false);
  });
});
