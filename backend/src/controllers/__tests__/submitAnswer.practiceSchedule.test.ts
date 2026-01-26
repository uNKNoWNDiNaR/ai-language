//backend/src/controllers/__tests__/submitAnswer.practiceSchedule.test.ts


import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks must be declared BEFORE importing submitAnswer ---

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

  // this is the “cooldown” map your controller should be using
  practiceCooldownByQuestionId: new Map(),
  save: vi.fn(async () => sessionDoc),
};

vi.mock("../../state/sessionState", () => {
  return {
    LessonSessionModel: {
      findOne: vi.fn(async ({ userId }: any) => (userId === "u1" ? sessionDoc : null)),
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
        {
          id: 1,
          question: "How do you say 'Hello' in English?",
          answer: "Hello",
          examples: ["Hello", "Hi"],
        },
      ],
    })),
  };
});

vi.mock("../../state/answerEvaluator", () => {
  return {
    evaluateAnswer: vi.fn(() => ({ result: "almost", reasonCode: "TYPO" })),
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
    generateTutorResponse: vi.fn(async () => "Tutor message"),
    generatePracticeJSON: vi.fn(async () => "{}"),
  };
});

const generatePracticeItemMock = vi.hoisted(() =>
  vi.fn(async () => ({
    source: "ai",
    item: {
      practiceId: "p-scheduled-1",
      lessonId: "basic-1",
      language: "en",
      prompt: "Practice prompt",
      expectedAnswerRaw: "Hello",
      examples: ["Hello", "Hi"],
      meta: { type: "variation", conceptTag: "lesson-basic-1-q1" },
    },
  })),
);


vi.mock("../../services/practiceGenerator", () => {
  return {
    generatePracticeItem: generatePracticeItemMock,
  };
});


function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("submitAnswer practice scheduling", () => {
  beforeEach(() => {
    process.env.PRACTICE_GEN_ENABLED = "true";
    vi.resetModules();

    // reset session state between tests
    sessionDoc.state = "USER_INPUT";
    sessionDoc.currentQuestionIndex = 0;
    sessionDoc.messages = [];
    sessionDoc.attemptCountByQuestionId = new Map();
    sessionDoc.lastAnswerByQuestionId = new Map();
    sessionDoc.practiceById = new Map();
    sessionDoc.practiceAttempts = new Map();
    sessionDoc.practiceCooldownByQuestionId = new Map();

    generatePracticeItemMock.mockClear();
    sessionDoc.save.mockClear();
  });

  it("generates practice only once for repeated 'almost' on same question", async () => {
    const { submitAnswer } = await import("../lessonController");

    // 1st almost -> should generate practice
    const req1: any = { body: { userId: "u1", answer: "helo", language: "en", lessonId: "basic-1" } };
    const res1 = makeRes();
    await submitAnswer(req1, res1);

    expect(res1.status).toHaveBeenCalledWith(200);
    const payload1 = res1.json.mock.calls[0][0];
    expect(payload1.evaluation.result).toBe("almost");


    // 2nd almost (same question) -> should NOT generate another practice
    const req2: any = { body: { userId: "u1", answer: "helo", language: "en", lessonId: "basic-1" } };
    const res2 = makeRes();
    await submitAnswer(req2, res2);

    expect(res2.status).toHaveBeenCalledWith(200);
    const payload2 = res2.json.mock.calls[0][0];
    expect(payload2.evaluation.result).toBe("almost");
    //expect(payload2.practice).toBeUndefined();
    expect(generatePracticeItemMock).toHaveBeenCalledTimes(1);
    expect(Boolean(payload1.practice) || Boolean(payload2.practice)).toBe(true);

    // const req3: any = { body: { userId: "u1", answer: "helo", language: "en", lessonId: "basic-1" } };
    // const res3 = makeRes();
    // await submitAnswer(req3, res3);

    // expect(res3.status).toHaveBeenCalledWith(200);
    // const payload3 = res3.json.mock.calls[0][0];
    // expect(payload3.evaluation.result).toBe("almost");
    // expect(payload3.practice).toBeUndefined();
    // expect(generatePracticeItemMock).toHaveBeenCalledTimes(1);

  });
});
