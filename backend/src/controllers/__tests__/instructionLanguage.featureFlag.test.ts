import { describe, it, expect, vi, beforeEach } from "vitest";

const findOneMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());
const deleteOneMock = vi.hoisted(() => vi.fn());

const updateOneMock = vi.hoisted(() => vi.fn(async () => ({})));

const setInstructionLanguageMock = vi.hoisted(() => vi.fn(async () => undefined));
const getInstructionLanguageMock = vi.hoisted(() => vi.fn(async () => "en"));
const updateTeachingProfilePrefsMock = vi.hoisted(() => vi.fn(async () => undefined));

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

vi.mock("../../state/sessionState", () => ({
  LessonSessionModel: {
    findOne: findOneMock,
    create: createMock,
    deleteOne: deleteOneMock,
  },
}));

vi.mock("../../state/progressState", () => ({
  LessonProgressModel: {
    updateOne: updateOneMock,
    deleteOne: vi.fn(async () => ({})),
  },
}));

vi.mock("../../state/lessonLoader", () => ({
  loadLesson: vi.fn(() => ({
    lessonId: "basic-1",
    title: "T",
    description: "D",
    questions: [{ id: 1, question: "Q1?", answer: "A1", examples: ["A1"] }],
  })),
}));

vi.mock("../../state/answerEvaluator", () => ({
  evaluateAnswer: vi.fn(() => ({ result: "correct", reasonCode: "EXACT" })),
}));

vi.mock("../../ai/promptBuilder", () => ({
  buildTutorPrompt: vi.fn(() => "PROMPT"),
}));

vi.mock("../../ai/staticTutorMessages", () => ({
  getDeterministicRetryMessage: vi.fn(() => "retry"),
  getForcedAdvanceMessage: vi.fn(() => "forced advance"),
  getHintLeadIn: vi.fn(() => "Hint:"),
  getFocusNudge: vi.fn(() => ""),
  getDeterministicRetryExplanation: vi.fn(() => ""),
}));

vi.mock("../../ai/openaiClient", () => ({
  generateTutorResponse: vi.fn(async () => ({ primaryText: "Let's begin.\nQ1?" })),
  generatePracticeJSON: vi.fn(async () => "{}"),
}));

vi.mock("../../services/practiceGenerator", () => ({
  generatePracticeItem: vi.fn(),
}));

vi.mock("../../storage/learnerProfileStore", () => ({
  updateTeachingProfilePrefs: updateTeachingProfilePrefsMock,
  setInstructionLanguage: setInstructionLanguageMock,
  getInstructionLanguage: getInstructionLanguageMock,
  getSupportProfile: vi.fn(async () => ({ supportLevel: 0.85, supportMode: "auto" })),
  recordLessonAttempt: vi.fn(async () => undefined),
  recordReviewPracticeOutcome: vi.fn(async () => undefined),
  getLearnerProfileSummary: vi.fn(async () => null),
  getLearnerTopFocusReason: vi.fn(async () => null),
  getConceptMistakeCount: vi.fn(async () => 0),
  getTeachingProfilePrefs: vi.fn(async () => null),
}));

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.locals = {};
  return res;
}

describe("instructionLanguage feature flag", () => {
  beforeEach(() => {
    vi.resetModules();
    findOneMock.mockReset();
    createMock.mockReset();
    deleteOneMock.mockReset();
    updateOneMock.mockReset();
    setInstructionLanguageMock.mockReset();
    getInstructionLanguageMock.mockReset();
    updateTeachingProfilePrefsMock.mockReset();

    sessionDoc.state = "USER_INPUT";
    sessionDoc.currentQuestionIndex = 0;
    sessionDoc.messages = [];
    sessionDoc.attemptCountByQuestionId = new Map();
    sessionDoc.lastAnswerByQuestionId = new Map();
    sessionDoc.practiceById = new Map();
    sessionDoc.practiceAttempts = new Map();
    sessionDoc.practiceCooldownByQuestionId = new Map();
    sessionDoc.save.mockClear();

    process.env.FEATURE_INSTRUCTION_LANGUAGE = "";
  });

  it("ignores instructionLanguage when flag is OFF", async () => {
    process.env.FEATURE_INSTRUCTION_LANGUAGE = "0";

    findOneMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      ...sessionDoc,
      messages: [{ role: "assistant", content: "Let's begin.\nQ1?" }],
    });

    const { startLesson } = await import("../lessonController");

    const req: any = {
      body: {
        userId: "u1",
        language: "en",
        lessonId: "basic-1",
        teachingPrefs: { pace: "normal", explanationDepth: "normal", instructionLanguage: "de" },
      },
    };
    const res = makeRes();

    await startLesson(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(setInstructionLanguageMock).not.toHaveBeenCalled();
  });

  it("persists instructionLanguage when flag is ON", async () => {
    process.env.FEATURE_INSTRUCTION_LANGUAGE = "1";

    findOneMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      ...sessionDoc,
      messages: [{ role: "assistant", content: "Let's begin.\nQ1?" }],
    });

    const { startLesson } = await import("../lessonController");

    const req: any = {
      body: {
        userId: "u1",
        language: "en",
        lessonId: "basic-1",
        teachingPrefs: { pace: "normal", explanationDepth: "normal", instructionLanguage: "de" },
      },
    };
    const res = makeRes();

    await startLesson(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(setInstructionLanguageMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", language: "en", instructionLanguage: "de" })
    );
  });

  it("persists instructionLanguage on submitAnswer when flag is ON", async () => {
    process.env.FEATURE_INSTRUCTION_LANGUAGE = "1";

    findOneMock.mockResolvedValue(sessionDoc);

    const { submitAnswer } = await import("../lessonController");

    const req: any = {
      body: {
        userId: "u1",
        answer: "A1",
        language: "en",
        lessonId: "basic-1",
        teachingPrefs: { pace: "normal", explanationDepth: "normal", instructionLanguage: "fr" },
      },
    };
    const res = makeRes();

    await submitAnswer(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(setInstructionLanguageMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", language: "en", instructionLanguage: "fr" })
    );
  });
});
