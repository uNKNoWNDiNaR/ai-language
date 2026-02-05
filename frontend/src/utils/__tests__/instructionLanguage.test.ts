import { describe, it, expect } from "vitest";
import {
  isInstructionLanguageEnabledFlag,
  normalizeInstructionLanguage,
  buildTeachingPrefsPayload,
} from "../instructionLanguage";

describe("instructionLanguage utils", () => {
  it("parses instruction language feature flag", () => {
    expect(isInstructionLanguageEnabledFlag("1")).toBe(true);
    expect(isInstructionLanguageEnabledFlag("true")).toBe(true);
    expect(isInstructionLanguageEnabledFlag("0")).toBe(false);
    expect(isInstructionLanguageEnabledFlag(undefined)).toBe(false);
  });

  it("normalizes supported languages and rejects invalid", () => {
    expect(normalizeInstructionLanguage("EN")).toBe("en");
    expect(normalizeInstructionLanguage("de")).toBe("de");
    expect(normalizeInstructionLanguage("jp")).toBeNull();
  });

  it("includes instructionLanguage in payload only when enabled", () => {
    const baseArgs = { pace: "normal" as const, explanationDepth: "normal" as const };

    const disabled = buildTeachingPrefsPayload({
      ...baseArgs,
      instructionLanguage: "de",
      enableInstructionLanguage: false,
    });
    expect(disabled).toEqual({ pace: "normal", explanationDepth: "normal" });

    const enabled = buildTeachingPrefsPayload({
      ...baseArgs,
      instructionLanguage: "de",
      enableInstructionLanguage: true,
    });
    expect(enabled).toEqual({ pace: "normal", explanationDepth: "normal", instructionLanguage: "de" });
  });
});
