import { describe, expect, it } from "vitest";
import { validateLessonJson } from "../lessonValidator";

const baseLesson = {
  lessonId: "basic-1",
  title: "Basics",
  description: "",
  questions: [
    {
      id: 1,
      question: "Say hello",
      answer: "Hello",
      conceptTag: "greetings",
      acceptedAnswers: ["Hello"],
    },
  ],
};

describe("validateLessonJson", () => {
  it("passes a valid lesson", () => {
    const res = validateLessonJson(baseLesson, "en/basic-1.json");
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("fails when conceptTag is missing", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Say hello",
          answer: "Hello",
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("conceptTag is required"))).toBe(true);
  });

  it("fails when acceptedAnswers has wrong type", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Say hello",
          answer: "Hello",
          conceptTag: "greetings",
          acceptedAnswers: "Hello",
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("acceptedAnswers must be an array of strings"))).toBe(true);
  });

  it("fails when acceptedAnswers has duplicates", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Say hello",
          answer: "Hello",
          conceptTag: "greetings",
          acceptedAnswers: ["Hello", "hello"],
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("acceptedAnswers must not contain duplicates"))).toBe(true);
  });

  it("fails when acceptedAnswers does not include answer", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Say hello",
          answer: "Hello",
          conceptTag: "greetings",
          acceptedAnswers: ["Hi"],
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("acceptedAnswers must include answer"))).toBe(true);
  });
});
