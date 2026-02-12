// backend/src/services/__tests__/quickReviewGenerator.test.ts

import { describe, it, expect } from "vitest";
import { generateQuickReviewItems, isPromptLeakingAnswer } from "../quickReviewGenerator";
import type { Lesson } from "../../state/lessonLoader";

describe("generateQuickReviewItems", () => {
  const lesson: Lesson = {
    lessonId: "basic-1",
    title: "Basics",
    description: "Test lesson",
    questions: [
      {
        id: 1,
        question: "Complete: I ___ Alex.",
        prompt: "Complete: I ___ Alex.",
        answer: "I am Alex.",
        expectedInput: "blank",
        blankAnswers: ["am"],
        conceptTag: "be",
        promptStyle: "BLANK_AUX",
      },
      {
        id: 2,
        question: "Make a sentence about tea.",
        prompt: "Make a sentence about tea.",
        answer: "I like tea.",
        conceptTag: "like",
        promptStyle: "WORD_BANK",
      },
      {
        id: 3,
        question: "Ask a name question.",
        prompt: "Ask a question about a name.",
        answer: "What is your name?",
        conceptTag: "ask_name",
      },
      {
        id: 4,
        question: "Complete: You ___ a student.",
        prompt: "Complete: You ___ a student.",
        answer: "You are a student.",
        expectedInput: "blank",
        blankAnswers: ["are"],
        conceptTag: "be",
        promptStyle: "BLANK_AUX",
      },
    ],
  };

  it("returns 2-3 items with unique concept tags", () => {
    const { items } = generateQuickReviewItems({
      lesson,
      language: "en",
      attemptCountByQuestionId: new Map([["1", 2], ["2", 1]]),
      maxItems: 3,
    });

    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(3);
    const uniqueTags = new Set(items.map((item) => item.conceptTag));
    expect(uniqueTags.size).toBe(items.length);
  });

  it("includes at least two kinds when possible", () => {
    const { items } = generateQuickReviewItems({ lesson, language: "en" });
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });

  it("blank items include ___ and blankAnswers", () => {
    const { items } = generateQuickReviewItems({ lesson, language: "en" });
    const blank = items.find((item) => item.kind === "blank");
    expect(blank).toBeTruthy();
    if (blank) {
      expect(blank.prompt).toContain("___");
      expect(blank.blankAnswers && blank.blankAnswers.length > 0).toBe(true);
    }
  });

  it("sentence prompts do not leak the full answer", () => {
    const { items } = generateQuickReviewItems({ lesson, language: "en" });
    const sentenceItems = items.filter((item) => item.expectedInput === "sentence");
    for (const item of sentenceItems) {
      expect(isPromptLeakingAnswer(item.prompt, item.answer)).toBe(false);
    }
  });

  it("avoids generic short sentence prompts", () => {
    const { items } = generateQuickReviewItems({ lesson, language: "en" });
    for (const item of items) {
      const normalized = item.prompt.trim().toLowerCase().replace(/[.!?]+$/g, "");
      expect(normalized).not.toBe("write a short sentence");
      expect(normalized).not.toBe("write a sentence");
      expect(normalized).not.toBe("make a sentence");
      expect(normalized).not.toBe("short response");
    }
  });
});
