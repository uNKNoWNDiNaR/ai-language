import { describe, it, expect, vi, beforeEach } from "vitest";

const findOneMock = vi.hoisted(() => vi.fn());

vi.mock("../../state/sessionState", () => ({
  LessonSessionModel: {
    findOne: findOneMock,
  },
}));

vi.mock("../../state/progressState", () => ({
  LessonProgressModel: {
    updateOne: vi.fn(async () => ({})),
    deleteOne: vi.fn(async () => ({})),
  },
}));

vi.mock("../../state/lessonLoader", () => ({
  loadLesson: vi.fn(),
}));

vi.mock("../../ai/promptBuilder", () => ({
  buildTutorPrompt: vi.fn(() => ""),
}));

vi.mock("../../ai/openaiClient", () => ({
  generateTutorResponse: vi.fn(async () => ({ primaryText: "" })),
  generatePracticeJSON: vi.fn(),
}));

vi.mock("../../services/practiceGenerator", () => ({
  generatePracticeItem: vi.fn(),
}));

vi.mock("../../storage/learnerProfileStore", () => ({
  recordLessonAttempt: vi.fn(async () => undefined),
  recordReviewPracticeOutcome: vi.fn(async () => undefined),
  getLearnerProfileSummary: vi.fn(async () => null),
  getLearnerTopFocusReason: vi.fn(async () => null),
  getConceptMistakeCount: vi.fn(async () => 0),
  getTeachingProfilePrefs: vi.fn(async () => null),
  getSupportProfile: vi.fn(async () => ({ supportLevel: 0.85, supportMode: "auto" })),
  getInstructionLanguage: vi.fn(async () => "en"),
  setInstructionLanguage: vi.fn(async () => undefined),
}));

vi.mock("../../config/featureFlags", () => ({
  isPracticeGenEnabled: () => false,
  isInstructionLanguageEnabled: () => false,
}));

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.locals = {};
  return res;
}

describe("lessonController missing session handling", () => {
  beforeEach(() => {
    findOneMock.mockReset();
    findOneMock.mockResolvedValue(null);
  });

  it("submitAnswer returns 404 when session missing", async () => {
    const { submitAnswer } = await import("../lessonController");
    const req: any = { body: { userId: "u1", answer: "Hello", language: "en", lessonId: "basic-1" } };
    const res = makeRes();

    await submitAnswer(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "No active session found", code: "NOT_FOUND" }),
    );
  });

  it("getSessionHandler returns 404 when session missing", async () => {
    const { getSessionHandler } = await import("../lessonController");
    const req: any = { params: { userId: "u1" } };
    const res = makeRes();

    await getSessionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "No active sessions found", code: "NOT_FOUND" }),
    );
  });
});
