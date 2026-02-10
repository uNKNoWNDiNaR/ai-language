import { describe, expect, it } from "vitest";
import { validateLessonJson } from "../lessonValidator";

const baseLesson = {
  lessonId: "basic-1",
  title: "Basics",
  description: "",
  questions: [
    {
      id: 1,
      question: "Greet someone.",
      prompt: "Greet someone.",
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

  it("fails when typing prompt includes the answer", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Say: Hello.",
          prompt: "Say: Hello.",
          answer: "Hello.",
          conceptTag: "greetings",
          acceptedAnswers: ["Hello."],
          taskType: "typing",
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(
      res.errors.some((e) => e.includes("prompt must not include the answer"))
    ).toBe(true);
  });

  it("allows speaking prompts to include the answer", () => {
    const ok = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Say: Hello.",
          prompt: "Say: Hello.",
          answer: "Hello.",
          conceptTag: "greetings",
          acceptedAnswers: ["Hello."],
          taskType: "speaking",
        },
      ],
    };

    const res = validateLessonJson(ok, "en/basic-1.json");
    expect(res.ok).toBe(true);
  });

  it("allows placeholder answers to appear in the prompt", () => {
    const ok = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Write: My name is [Your name].",
          prompt: "Write: My name is [Your name].",
          answer: "[Your name]",
          conceptTag: "intro_name",
          acceptedAnswers: ["[Your name]"],
          taskType: "typing",
        },
      ],
    };

    const res = validateLessonJson(ok, "en/basic-1.json");
    expect(res.ok).toBe(true);
  });

  it("accepts valid promptStyle values", () => {
    const ok = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Complete: I ___ here.",
          prompt: "Complete: I ___ here.",
          answer: "I am here.",
          conceptTag: "greetings",
          acceptedAnswers: ["I am here."],
          taskType: "typing",
          promptStyle: "BLANK_AUX",
        },
      ],
    };

    const res = validateLessonJson(ok, "en/basic-1.json");
    expect(res.ok).toBe(true);
  });

  it("rejects invalid promptStyle values", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Greet someone.",
          prompt: "Greet someone.",
          answer: "Hello",
          conceptTag: "greetings",
          acceptedAnswers: ["Hello"],
          taskType: "typing",
          promptStyle: "BAD_STYLE",
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("promptStyle"))).toBe(true);
  });

  it("fails when conceptTag is missing", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Say hello",
          prompt: "Say hello",
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
          prompt: "Say hello",
          answer: "Hello",
          conceptTag: "greetings",
          acceptedAnswers: "Hello",
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(
      res.errors.some((e) => e.includes("acceptedAnswers") && e.includes("array of strings"))
    ).toBe(true);
  });

  it("fails when acceptedAnswers has duplicates", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Say hello",
          prompt: "Say hello",
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
          prompt: "Say hello",
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

  it("fails when prompt is missing", () => {
    const bad = {
      ...baseLesson,
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

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("prompt is required"))).toBe(true);
  });

  it("fails when expectedInput is blank but blankAnswers are missing", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Complete: I ___ here.",
          prompt: "Complete: I ___ here.",
          answer: "I am here.",
          conceptTag: "greetings",
          acceptedAnswers: ["I am here."],
          expectedInput: "blank",
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("blankAnswers"))).toBe(true);
  });

  it("fails when blank prompt is missing ___", () => {
    const bad = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Complete: I am here.",
          prompt: "Complete: I am here.",
          answer: "I am here.",
          conceptTag: "greetings",
          acceptedAnswers: ["I am here."],
          expectedInput: "blank",
          blankAnswers: ["am"],
        },
      ],
    };

    const res = validateLessonJson(bad, "en/basic-1.json");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("must include ___"))).toBe(true);
  });

  it("passes when blank prompt includes ___ and blankAnswers are provided", () => {
    const ok = {
      ...baseLesson,
      questions: [
        {
          id: 1,
          question: "Complete: I ___ here.",
          prompt: "Complete: I ___ here.",
          answer: "I am here.",
          conceptTag: "greetings",
          acceptedAnswers: ["I am here."],
          expectedInput: "blank",
          blankAnswers: ["am"],
        },
      ],
    };

    const res = validateLessonJson(ok, "en/basic-1.json");
    expect(res.ok).toBe(true);
  });
});
