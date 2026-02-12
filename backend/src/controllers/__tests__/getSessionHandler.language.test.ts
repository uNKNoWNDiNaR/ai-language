import { describe, it, expect, vi, beforeEach } from "vitest";

const findOneMock = vi.hoisted(() => vi.fn());

vi.mock("../../state/sessionState", () => ({
  LessonSessionModel: {
    findOne: findOneMock,
  },
}));

vi.mock("../../state/lessonLoader", () => ({
  loadLesson: vi.fn(() => ({
    questions: [{ id: 1, question: "Q1", answer: "A1" }],
  })),
}));

vi.mock("../../storage/learnerProfileStore", () => ({
  getInstructionLanguage: vi.fn(async () => "en"),
  getTeachingProfilePrefs: vi.fn(async () => null),
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

describe("getSessionHandler language filtering", () => {
  beforeEach(() => {
    findOneMock.mockReset();
  });

  it("returns the session for the requested language", async () => {
    const session = {
      userId: "u1",
      language: "en",
      lessonId: "basic-1",
      state: "USER_INPUT",
      currentQuestionIndex: 0,
      messages: [{ role: "assistant", content: "Let's begin.\nQ1" }],
    };

    findOneMock.mockResolvedValue(session);

    const { getSessionHandler } = await import("../lessonController");
    const req: any = { params: { userId: "u1" }, query: { language: "en" } };
    const res = makeRes();

    await getSessionHandler(req, res);

    expect(findOneMock).toHaveBeenCalledWith(
      { userId: "u1", language: "en" },
      undefined,
      { sort: { updatedAt: -1 } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ session }));
  });

  it("returns the session for another language when requested", async () => {
    const session = {
      userId: "u1",
      language: "de",
      lessonId: "basic-2",
      state: "USER_INPUT",
      currentQuestionIndex: 0,
      messages: [{ role: "assistant", content: "Start.\nQ1" }],
    };

    findOneMock.mockResolvedValue(session);

    const { getSessionHandler } = await import("../lessonController");
    const req: any = { params: { userId: "u1" }, query: { language: "de" } };
    const res = makeRes();

    await getSessionHandler(req, res);

    expect(findOneMock).toHaveBeenCalledWith(
      { userId: "u1", language: "de" },
      undefined,
      { sort: { updatedAt: -1 } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ session }));
  });

  it("returns the most recent session when language is not provided", async () => {
    const session = {
      userId: "u1",
      language: "en",
      lessonId: "basic-1",
      state: "USER_INPUT",
      currentQuestionIndex: 0,
      messages: [{ role: "assistant", content: "Let's begin.\nQ1" }],
    };

    findOneMock.mockResolvedValue(session);

    const { getSessionHandler } = await import("../lessonController");
    const req: any = { params: { userId: "u1" }, query: {} };
    const res = makeRes();

    await getSessionHandler(req, res);

    expect(findOneMock).toHaveBeenCalledWith(
      { userId: "u1" },
      undefined,
      { sort: { updatedAt: -1 } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ session }));
  });
});
