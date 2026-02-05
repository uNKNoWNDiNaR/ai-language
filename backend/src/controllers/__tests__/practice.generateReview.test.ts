// backend/src/controllers/__tests__/practice.generateReview.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const updateSessionMock = vi.hoisted(() => vi.fn());
const createSessionMock = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("../../storage/sessionStore", () => ({
  getSession: getSessionMock,
  updateSession: updateSessionMock,
  createSession: createSessionMock,
}));

vi.mock("../../state/lessonLoader", () => ({
  loadLesson: (language: string, lessonId: string) => {
    if (lessonId !== "basic-1") return null;
    return {
      lessonId: "basic-1",
      title: "T",
      description: "D",
      questions: [
        {
          id: 1,
          question: "How do you say 'Hello' in English?",
          answer: "Hello",
          examples: ["Hello", "Hi"],
          conceptTag: "greetings",
        },
        {
          id: 2,
          question: "How do you ask someone their name?",
          answer: "What is your name?",
          examples: ["What is your name?"],
          conceptTag: "asking_name",
        },
      ],
    };
  },
}));

vi.mock("../../services/practiceGenerator", async () => {
  const actual = await vi.importActual<any>("../../services/practiceGenerator");
  return {
    ...actual,
    generatePracticeItem: vi.fn(async (params: any, aiClient: any) => {
      if (!aiClient || typeof aiClient.generatePracticeJSON !== "function") {
        throw new Error("Expected aiClient with generatePracticeJSON");
      }

      return {
        source: "fallback",
        item: {
          practiceId: `p-${params.sourceQuestionText.length}`,
          lessonId: params.lessonId,
          language: params.language,
          prompt: `Practice: ${params.sourceQuestionText}`,
          expectedAnswerRaw: params.expectedAnswerRaw,
          examples: params.examples,
          meta: { type: params.type ?? "variation", conceptTag: params.conceptTag },
        },
      };
    }),
  };
});

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("POST /practice/generateReview", () => {
  let generateReview: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    getSessionMock.mockResolvedValue({
      userId: "u1",
      state: "COMPLETE",
      currentQuestionIndex: 2,
      practiceById: new Map(),
      practiceAttempts: new Map(),
    });
    updateSessionMock.mockResolvedValue(undefined);

    ({ generateReview } = await import("../practiceController"));
  });

  it("400 when items missing", async () => {
    const req: any = { body: { userId: "u1", language: "en" } };
    const res = makeRes();

    await generateReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it.each(["de", "es", "fr"])("accepts %s language", async (lang) => {
    const req: any = {
      body: {
        userId: "u1",
        language: lang,
        items: [{ lessonId: "basic-1", questionId: "1" }],
      },
    };
    const res = makeRes();

    await generateReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("200 returns review practice and does not alter lesson state", async () => {
    const req: any = {
      body: {
        userId: "u1",
        language: "en",
        items: [{ lessonId: "basic-1", questionId: "1" }],
      },
    };
    const res = makeRes();

    await generateReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.practice).toHaveLength(1);
    expect(payload.practice[0].prompt).toContain("Hello");

    const savedSession = updateSessionMock.mock.calls[0][0];
    expect(savedSession.state).toBe("COMPLETE");
    expect(savedSession.currentQuestionIndex).toBe(2);
  });

  it("caps to 2 items", async () => {
    const req: any = {
      body: {
        userId: "u1",
        language: "en",
        items: [
          { lessonId: "basic-1", questionId: "1" },
          { lessonId: "basic-1", questionId: "2" },
          { lessonId: "basic-1", questionId: "1" },
        ],
      },
    };
    const res = makeRes();

    await generateReview(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.practice).toHaveLength(2);
  });
});
