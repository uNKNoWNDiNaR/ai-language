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
          conceptTag: "greetings",
        },
        {
          id: 2,
          question: "Second question?",
          answer: "Second answer",
          examples: ["Second answer"],
          conceptTag: "Second",
        },
      ],
    })),
  };
});

const recordLessonAttemptMock = vi.hoisted(() => vi.fn(async () => undefined));
const getLearnerProfileSummaryMock = vi.hoisted(() => vi.fn(async () => null));
const getLearnerTopFocusReasonMock = vi.hoisted(() => vi.fn(async () => null));
const getConceptMistakeCountMock = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../../storage/learnerProfileStore", () => {
  return {
    recordLessonAttempt: recordLessonAttemptMock,
    recordReviewPracticeOutcome: vi.fn(async () => undefined),
    getLearnerProfileSummary: getLearnerProfileSummaryMock,
    getLearnerTopFocusReason: getLearnerTopFocusReasonMock,
    getSupportProfile: vi.fn(async () => ({ supportLevel: 0.85, supportMode: "auto" })),
    getConceptMistakeCount: getConceptMistakeCountMock,
    getInstructionLanguage: vi.fn(async () => "en"),
    setInstructionLanguage: vi.fn(async () => undefined),
  };
});


const evaluateAnswerMock = vi.hoisted(() => vi.fn());

vi.mock("../../state/answerEvaluator", () => {
  return {
    evaluateAnswer: evaluateAnswerMock,
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
    getFocusNudge: vi.fn(() => ""),
    getDeterministicRetryExplanation: vi.fn(() => ""),
    getStartTransition: vi.fn(() => "start"),
    getAdvanceTransition: vi.fn(() => "advance"),
    getNextQuestionLabel: vi.fn(() => "Next question:"),
    getEndLessonMessage: vi.fn(() => "Lesson complete."),
    getHintLabel: vi.fn(() => "Hint:"),
    getPacePrefix: vi.fn(() => "Take your time."),
  };
});


vi.mock("../../ai/openaiClient", () => {
  return {
    generateTutorResponse: vi.fn(async () => ({ primaryText: "Tutor message" })),
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
      meta: { type: "variation", conceptTag: "greetings" },
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
    evaluateAnswerMock.mockReset();
    evaluateAnswerMock.mockReturnValue({ result: "almost", reasonCode: "TYPO" });
    getConceptMistakeCountMock.mockReset();
    getConceptMistakeCountMock.mockResolvedValue(0);

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
    expect(generatePracticeItemMock).toHaveBeenCalledTimes(1);
    expect(generatePracticeItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ conceptTag: "greetings" }),
      expect.any(Object),
      expect.objectContaining({ forceEnabled: true })
  );

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

  it("generates practice on FORCED_ADVANCE (attempt 4+) once per question", async () => {
    const { submitAnswer } = await import("../lessonController");
    
    // force attemptCount to reach 4 in a single submit
    sessionDoc.attemptCountByQuestionId.set("1", 3);
    
    // not almost — forced advance should still schedule practice now
    evaluateAnswerMock.mockReturnValue({ result: "wrong", reasonCode: "OTHER" });
    
    getConceptMistakeCountMock.mockResolvedValue(2);

    const req: any = { body: { userId: "u1", answer: "nope", language: "en", lessonId: "basic-1" } };
    const res = makeRes();
    await submitAnswer(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    
    const payload = res.json.mock.calls[0][0];
    expect(payload.evaluation.result).toBe("wrong");
    
    // practice should be included
    expect(Boolean(payload.practice)).toBe(true);
    
    // generator called once
    expect(generatePracticeItemMock).toHaveBeenCalledTimes(1);
    
    // If you used Option A from earlier (recommended), use this:
    expect(generatePracticeItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ conceptTag: "greetings" }),
      expect.any(Object),
      expect.objectContaining({ forceEnabled: true })
    );
  });

    it("does NOT generate practice on FORCED_ADVANCE when concept count is below threshold", async () => {
    const { submitAnswer } = await import("../lessonController");

    // force attemptCount to reach 4 in a single submit
    sessionDoc.attemptCountByQuestionId.set("1", 3);

    // not almost — would be forced advance
    evaluateAnswerMock.mockReturnValue({ result: "wrong", reasonCode: "OTHER" });

    // below threshold => no practice
    getConceptMistakeCountMock.mockResolvedValue(0);

    const req: any = { body: { userId: "u1", answer: "nope", language: "en", lessonId: "basic-1" } };
    const res = makeRes();
    await submitAnswer(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const payload = res.json.mock.calls[0][0];
    expect(payload.evaluation.result).toBe("wrong");
    expect(payload.practice).toBeUndefined();

    // generator should NOT be called
    expect(generatePracticeItemMock).toHaveBeenCalledTimes(0);
  });

});
