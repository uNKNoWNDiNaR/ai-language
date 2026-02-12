import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock models used in lessonController
vi.mock("../../state/sessionState", () => ({
  LessonSessionModel: {
    findOne: vi.fn(),
    deleteOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../state/progressState", () => ({
  LessonProgressModel: {
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

// Mock lesson loading so startLesson can proceed
vi.mock("../../state/lessonLoader", () => ({
  loadLesson: vi.fn(() => ({
    questions: [{ id: 1, question: "Q1", answer: "A1" }],
  })),
}));

// Mock prompt + AI
vi.mock("../../ai/promptBuilder", () => ({
  buildTutorPrompt: vi.fn(() => "PROMPT"),
}));

vi.mock("../../ai/openaiClient", () => ({
  generateTutorResponse: vi.fn(async () => ({ primaryText: "Let's begin.\nQ1" })),
}));

// Import after mocks
import { startLesson } from "../lessonController";
import { LessonSessionModel } from "../../state/sessionState";
import { LessonProgressModel } from "../../state/progressState";

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("startLesson restart/continue behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restart:true deletes same-lesson COMPLETE session and creates a fresh one", async () => {
    (LessonSessionModel.findOne as any).mockResolvedValue({
      userId: "u1",
      lessonId: "basic-1",
      language: "en",
      state: "COMPLETE",
      currentQuestionIndex: 2,
      messages: [{ role: "assistant", content: "Congrats" }],
      save: vi.fn(),
    });

    (LessonSessionModel.create as any).mockResolvedValue({
      userId: "u1",
      lessonId: "basic-1",
      language: "en",
      state: "USER_INPUT",
      currentQuestionIndex: 0,
      messages: [{ role: "assistant", content: "Let's begin.\nQ1" }],
    });

    const req: any = {
      body: { userId: "u1", language: "en", lessonId: "basic-1", restart: true },
    };
    const res = mockRes();

    await startLesson(req, res);

    expect(LessonProgressModel.deleteOne).toHaveBeenCalledWith({
      userId: "u1",
      language: "en",
      lessonId: "basic-1",
    });
    expect(LessonSessionModel.deleteOne).toHaveBeenCalledWith({ userId: "u1", language: "en" });
    expect(LessonSessionModel.create).toHaveBeenCalled();
    // new session path in your handler returns 201
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("continue returns existing same-lesson session (no delete/create)", async () => {
    (LessonSessionModel.findOne as any).mockResolvedValue({
      userId: "u1",
      lessonId: "basic-1",
      language: "en",
      state: "COMPLETE",
      currentQuestionIndex: 2,
      messages: [{ role: "assistant", content: "Congrats" }],
      save: vi.fn(),
    });

    const req: any = { body: { userId: "u1", language: "en", lessonId: "basic-1" } };
    const res = mockRes();

    await startLesson(req, res);

    expect(LessonSessionModel.deleteOne).not.toHaveBeenCalled();
    expect(LessonSessionModel.create).not.toHaveBeenCalled();
    expect(LessonProgressModel.deleteOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("creates progress for the selected lesson only", async () => {
    (LessonSessionModel.findOne as any).mockResolvedValue(null);

    (LessonSessionModel.create as any).mockResolvedValue({
      userId: "u1",
      lessonId: "basic-2",
      language: "en",
      state: "USER_INPUT",
      currentQuestionIndex: 0,
      messages: [{ role: "assistant", content: "Let's begin.\nQ1" }],
    });

    const req: any = { body: { userId: "u1", language: "en", lessonId: "basic-2" } };
    const res = mockRes();

    await startLesson(req, res);

    expect(LessonProgressModel.updateOne).toHaveBeenCalledWith(
      { userId: "u1", language: "en", lessonId: "basic-2" },
      expect.any(Object),
      { upsert: true }
    );
  });
});
