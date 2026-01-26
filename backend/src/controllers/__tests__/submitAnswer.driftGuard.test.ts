//backend/src/controllers/__tests__/submitAnswer.driftGuard.test.ts

// backend/src/controllers/__tests__/submitAnswer.driftGuard.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

const sessionDoc: any = {
  userId: "u1",
  lessonId: "basic-1",
  language: "en",
  state: "USER_INPUT",
  attempts: 0,
  maxAttempts: 4,
  currentQuestionIndex: 0,
  messages: [],
  attemptCountByQuestionId: new Map(),
  lastAnswerByQuestionId: new Map(),
  practiceById: new Map(),
  practiceAttempts: new Map(),
  practiceCooldownByQuestionId: new Map(),
  save: vi.fn(async () => sessionDoc),
};

vi.mock("../../state/sessionState", () => {
  return {
    LessonSessionModel: {
      findOne: vi.fn(async ({ userId }: any) => (userId === "u1" ? sessionDoc : null)),
      create: vi.fn(),
      deleteOne: vi.fn(),
    },
  };
});

vi.mock("../../state/progressState", () => {
  return {
    LessonProgressModel: {
      updateOne: vi.fn(async () => ({})),
      deleteOne: vi.fn(async () => ({})),
    },
  };
});

vi.mock("../../state/lessonLoader", () => {
  return {
    loadLesson: vi.fn(() => ({
      lessonId: "basic-1",
      title: "T",
      description: "D",
      questions: [
        { id: 1, question: "How do you say 'Hello' in English?", answer: "Hello", examples: ["Hello", "Hi"] },
        { id: 2, question: "How do you ask someone their name?", answer: "What is your name?", examples: ["What is your name?"] },
      ],
    })),
  };
});

vi.mock("../../state/answerEvaluator", () => {
  return {
    evaluateAnswer: vi.fn(() => ({ result: "correct", reasonCode: "EXACT" })),
  };
});

vi.mock("../../ai/promptBuilder", () => {
  return {
    buildTutorPrompt: vi.fn(() => "PROMPT"),
  };
});

vi.mock("../../ai/staticTutorMessages", () => {
  return {
    getDeterministicRetryMessage: vi.fn(() => "retry"),
    getForcedAdvanceMessage: vi.fn(() => "forced advance"),
    getHintLeadIn: vi.fn(() => "Hint:"),
  };
});

vi.mock("../../ai/openaiClient", () => {
  return {
    generateTutorResponse: vi.fn(async () => "In French, you say Bonjour. What is your name?"),
    generatePracticeJSON: vi.fn(async () => "{}"),
  };
});

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("submitAnswer drift guard", () => {
  beforeEach(() => {
    vi.resetModules();

    sessionDoc.state = "USER_INPUT";
    sessionDoc.currentQuestionIndex = 0;
    sessionDoc.messages = [];
    sessionDoc.attemptCountByQuestionId = new Map();
    sessionDoc.lastAnswerByQuestionId = new Map();
    sessionDoc.practiceById = new Map();
    sessionDoc.practiceAttempts = new Map();
    sessionDoc.practiceCooldownByQuestionId = new Map();

    sessionDoc.save.mockClear();
  });

  it("replaces drifting AI output with deterministic fallback", async () => {
    const { submitAnswer } = await import("../lessonController");

    const req: any = { body: { userId: "u1", answer: "Hello", language: "en", lessonId: "basic-1" } };
    const res = makeRes();

    await submitAnswer(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];

    // should be ADVANCE and should not include the drifted “French”
    expect(payload.tutorMessage).toMatch(/Next question/i);
    expect(payload.tutorMessage).toMatch(/How do you ask someone their name\?/i);
    expect(payload.tutorMessage).not.toMatch(/french/i);
  });
});
