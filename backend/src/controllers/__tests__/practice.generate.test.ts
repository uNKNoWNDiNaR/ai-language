//backend/src/controllers/__tests__/practice.generate.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Hoisted mocks (must exist before importing controller) ----
const getSessionMock = vi.hoisted(() => vi.fn());
const updateSessionMock = vi.hoisted(() => vi.fn());

vi.mock("../../storage/sessionStore", () => {
  return {
    getSession: getSessionMock,
    updateSession: updateSessionMock,
  };
});

// Mock lessonLoader so tests don’t rely on filesystem
vi.mock("../../state/lessonLoader", () => {
  return {
    loadLesson: (language: string, lessonId: string) => {
      if (lessonId !== "basic-1") return null;
      return {
        lessonId: "basic-1",
        title: "T",
        description: "D",
        questions: [
          { id: 1, question: "How do you say 'Hello' in English?", answer: "Hello", examples: ["Hello", "Hi"] },
          { id: 2, question: "How do you ask someone their name?", answer: "What is your name?", examples: ["What is your name?"] },
        ],
      };
    },
  };
});

// Mock generator to avoid relying on env flag behavior.
// We only verify controller plumbing here.
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
          practiceId: "p-1",
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

describe("POST /practice/generate (controller)", () => {
  let generatePractice: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default session for tests that need it (Map-based)
    getSessionMock.mockResolvedValue({
      userId: "u1",
      practiceById: new Map(),
      practiceAttempts: new Map(),
    });
    updateSessionMock.mockResolvedValue(undefined);

    // Import AFTER mocks are in place
    ({ generatePractice } = await import("../practiceController"));
  });

  it("400 if missing userId", async () => {
    const req: any = { body: { lessonId: "basic-1", language: "en" } };
    const res = makeRes();

    await generatePractice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("400 if invalid language", async () => {
    const req: any = { body: { userId: "u1", lessonId: "basic-1", language: "it" } };
    const res = makeRes();

    await generatePractice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404 if lesson not found", async () => {
    const req: any = { body: { userId: "u1", lessonId: "nope", language: "en" } };
    const res = makeRes();

    await generatePractice(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200 returns practiceItem (default question 1)", async () => {
    const req: any = { body: { userId: "u1", lessonId: "basic-1", language: "en" } };
    const res = makeRes();

    await generatePractice(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.practiceItem).toBeTruthy();
    expect(payload.practiceItem.expectedAnswerRaw).toBe("Hello");
  });

  it("200 can target sourceQuestionId", async () => {
    const req: any = {
      body: { userId: "u1", lessonId: "basic-1", language: "en", sourceQuestionId: 2 },
    };
    const res = makeRes();

    await generatePractice(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.practiceItem.expectedAnswerRaw).toBe("What is your name?");
  });

  it("does not wipe existing practiceById/practiceAttempts (Map persistence)", async () => {
    const session: any = {
      userId: "u1",
      practiceById: new Map([
        [
          "existing-1",
          {
            practiceId: "existing-1",
            lessonId: "basic-1",
            language: "en",
            prompt: "Existing prompt",
            expectedAnswerRaw: "Hello",
            meta: { type: "variation", conceptTag: "keep" },
          },
        ],
      ]),
      practiceAttempts: new Map([["existing-1", 0]]),
    };

    getSessionMock.mockResolvedValue(session);

    // first generate
    const res1 = makeRes();
    await generatePractice({ body: { userId: "u1", lessonId: "basic-1", language: "en" } } as any, res1);
    expect(res1.status).toHaveBeenCalledWith(200);

    // second generate (same user/lesson again)
    const res2 = makeRes();
    await generatePractice({ body: { userId: "u1", lessonId: "basic-1", language: "en" } } as any, res2);
    expect(res2.status).toHaveBeenCalledWith(200);

    // Existing entry must still be there
    expect(session.practiceById.get("existing-1")).toBeTruthy();
    expect(session.practiceAttempts.get("existing-1")).toBe(0);

    // Newly written item must exist too
    expect(session.practiceById.get("p-1")).toBeTruthy();
    expect(session.practiceAttempts.get("p-1")).toBe(0);

    // And we did persist updates
    expect(updateSessionMock).toHaveBeenCalled();
  });
});
