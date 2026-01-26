//backend/src/validation/__tests__/practiceSchema.test.ts

import { describe, it, expect } from "vitest";
import { validatePracticeItem } from "../validatePracticeItem"

function makeValid(overrides: Partial<any> = {}) {
    return {
        practiceId: "p-1",
        lessonId: 'basic-1',
        language: "en",
        prompt: "say Hello",
        expectedAnswerRaw: "Hello",
        examples: ["Hello", "Hi"],
        meta: {type: "variation", conceptTag: "greetings" },
        ...overrides,
    };
}

describe("validatePracticeItem", () => {
    it("accepts a valid PracticeItem", () => {
        const res = validatePracticeItem(makeValid());
        expect(res.ok).toBe(true);
        if(res.ok) {
            expect(res.value.expectedAnswerRaw).toBe("Hello");
        }
    });

    it("rejects non-object input", () => {
        const res = validatePracticeItem("nope");
        expect(res.ok).toBe(false);
        if(!res.ok) expect(res.errors[0]).toMatch(/must be an object/i);
    });

    it("rejects missing required field", () => {
        const res = validatePracticeItem(makeValid({ expectedAnswerRaw: ""}));
        expect(res.ok).toBe(false);
        if(!res.ok) expect(res.errors.join(" | ")).toMatch(/expectedAnswerRaw is required/i);
    });

    it("rejects empty/whitespace prompt", () => {
        const res = validatePracticeItem(makeValid({ prompt: "  "}));
        expect(res.ok).toBe(false);
        if(!res.ok) expect(res.errors.join(" | ")).toMatch(/prompt is required/i);
    });

    it("rejects unsupported language", () => {
        const res = validatePracticeItem(makeValid({ language: "it"}));
        expect(res.ok).toBe(false);
        if(!res.ok) expect(res.errors.join(" | ")).toMatch(/not supported/i);
    });

    it("rejects unsupported meta.type", () => {
        const res = validatePracticeItem(makeValid({ meta: { type: "freechat", conceptTag: "x"} }));
        expect(res.ok).toBe(false);
        if(!res.ok) expect(res.errors.join(" | ")).toMatch(/meta\.type.*not supported/i);
    });

    it("rejects grading contamination in expectedAnswerRaw", () => {
        const res = validatePracticeItem(
            makeValid({ expectedAnswerRaw: "acceptable answers include: Hello, Hi" }),
        );
        expect(res.ok).toBe(false);
        if(!res.ok) expect(res.errors.join(" | ")).toMatch(/contamination/i);
    });

    it("rejects examples longer than max", () => {
        const res = validatePracticeItem(
            makeValid({ examples: ["1", "2", "3", "4", "5", "6", "7"] }),
        );
        expect(res.ok).toBe(false);
        if(!res.ok) expect(res.errors.join(" | ")).toMatch(/at most 6/i);
    });

    it("rejects examples containing empty strings", () => {
        const res = validatePracticeItem(makeValid({ examples: ["Hello", "  "] }),);
        expect(res.ok).toBe(false);
        if(!res.ok) expect(res.errors.join(" | ")).toMatch(/examples may not contain empty strings/i);
    });
});