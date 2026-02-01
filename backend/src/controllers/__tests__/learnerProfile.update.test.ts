// backend/src/controllers/__tests__/learnerProfile.update.test.ts

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
        { id: 1, question: "Q1?", answer: "A1", examples: ["A1"] },
        { id: 2, question: "Q2?", answer: "A2", examples: ["A2"] },
      ],
    })),
  };
});

vi.mock("../../state/answerEvaluator", () => {
  return {
    evaluateAnswer: vi.fn(() => ({ result: "wrong", reasonCode: "WORD_ORDER" })),
  };
});

vi.mock("../../ai/promptBuilder", () => {
  return { buildTutorPrompt: vi.fn(() => "PROMPT") };
});

vi.mock("../../ai/staticTutorMessages", () => {
  return {
    getDeterministicRetryMessage: vi.fn(() => "retry"),
    getForcedAdvanceMessage: vi.fn(() => "forced advance"),
    getHintLeadIn: vi.fn(() => "Hint:"),
    getFocusNudge: vi.fn(() => ""),
  };
});


vi.mock("../../ai/openaiClient", () => {
  return {
    generateTutorResponse: vi.fn(async () => "bad ai output"),
    generatePracticeJSON: vi.fn(async () => "{}"),
  };
});

const recordLessonAttemptMock = vi.hoisted(() => 
    vi.fn(async (_args: any) => undefined));

vi.mock("../../storage/learnerProfileStore", () => {
  return {
    recordLessonAttempt: recordLessonAttemptMock,
    getLearnerProfileSummary: vi.fn(async () => null),
    getLearnerTopFocusReason: vi.fn(async () => null),
  };
});

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("learner profile updates", () => {
  beforeEach(() => {
    vi.resetModules();

    sessionDoc.state = "USER_INPUT";
    sessionDoc.currentQuestionIndex = 0;
    sessionDoc.messages = [];
    sessionDoc.attemptCountByQuestionId = new Map();
    sessionDoc.lastAnswerByQuestionId = new Map();
    sessionDoc.practiceCooldownByQuestionId = new Map();

    recordLessonAttemptMock.mockClear();
    sessionDoc.save.mockClear();
  });

  it("flags forcedAdvance=true on attempt 4+", async () => {
    const { submitAnswer } = await import("../lessonController");

    for (let i = 0; i < 4; i++) {
      const req: any = { body: { userId: "u1", answer: "nope", language: "en", lessonId: "basic-1" } };
      const res = makeRes();
      await submitAnswer(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    }

    expect(recordLessonAttemptMock).toHaveBeenCalledTimes(4);

    const forcedArgs = recordLessonAttemptMock.mock.calls
        .map((c) => c[0] as any)
        .filter((a) => a?.forcedAdvance === true);

    expect(forcedArgs).toHaveLength(1);

    const forcedArg = forcedArgs[0];
    expect(forcedArg.userId).toBe("u1");
    expect(forcedArg.language).toBe("en");
    expect(forcedArg.reasonCode).toBe("WORD_ORDER");
  });
});
