//backend/src/controllers/__tests__/feedback.submit.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../storage/sessionStore", () => ({
  getSession: vi.fn(),
}));

vi.mock("../../state/lessonLoader", () => ({
  loadLesson: vi.fn(),
}));

vi.mock("../../state/feedbackState", () => ({
  LessonFeedbackModel: {
    create: vi.fn(),
  },
}));

import { submitFeedback } from "../feedbackController";
import { getSession } from "../../storage/sessionStore";
import { loadLesson } from "../../state/lessonLoader";
import { LessonFeedbackModel } from "../../state/feedbackState";

function mockRes() {
  const res: any = {};
  res.locals = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("submitFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when userId is missing", async () => {
    const req: any = { body: { feltRushed: true } };
    const res = mockRes();

    await submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "userId is required", code: "INVALID_REQUEST" }),
    );
  });

  it("returns 400 when all feedback fields are empty", async () => {
    const req: any = { body: { userId: "u1" } };
    const res = mockRes();

    await submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "EMPTY_FEEDBACK" }));
  });

  it("stores feedback with derived context from session + lesson", async () => {
    (getSession as any).mockResolvedValue({
      userId: "u1",
      lessonId: "basic-1",
      language: "en",
      state: "USER_INPUT",
      currentQuestionIndex: 0,
    });

    (loadLesson as any).mockReturnValue({
      lessonId: "basic-1",
      title: "t",
      description: "d",
      questions: [{ id: 1, question: "Q", answer: "A", conceptTag: "greetings" }],
    });

    const req: any = {
      body: {
        userId: "u1",
        anonSessionId: "anon_12345",
        feltRushed: false,
        helpedUnderstand: 5,
        confusedText: "I got mixed up about word order.",
      },
    };

    const res = mockRes();
    await submitFeedback(req, res);

    expect(LessonFeedbackModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        anonSessionId: "anon_12345",
        lessonId: "basic-1",
        language: "en",
        conceptTag: "greetings",
        sessionState: "USER_INPUT",
        currentQuestionIndex: 0,
        feltRushed: false,
        helpedUnderstand: 5,
      }),
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});