//backend/src/controllers/__tests__/feedback.lesson.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../state/feedbackState", () => ({
  LessonFeedbackModel: {
    create: vi.fn(),
  },
}));

import { submitLessonFeedback } from "../feedbackController";
import { LessonFeedbackModel } from "../../state/feedbackState";

function mockRes() {
  const res: any = {};
  res.locals = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("submitLessonFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores lesson feedback with context", async () => {
    const req: any = {
      body: {
        userId: "u1",
        targetLanguage: "de",
        instructionLanguage: "en",
        lessonId: "basic-1",
        sessionId: "u1|de|basic-1",
        supportLevel: "medium",
        feedbackType: "lesson_end",
        rating: 4,
        quickTags: ["good_pace"],
        freeText: "Nice pacing.",
        forcedChoice: {
          returnTomorrow: "yes",
          clarity: "very_clear",
          pace: "just_right",
          answerChecking: "fair",
        },
        testerContext: {
          version: 1,
          selfReportedLevel: "A1",
          goal: "SPEAKING",
          updatedAtISO: "2026-02-12T09:00:00.000Z",
        },
      },
    };

    const res = mockRes();
    await submitLessonFeedback(req, res);

    expect(LessonFeedbackModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: "basic-1",
        language: "de",
        targetLanguage: "de",
        feedbackType: "lesson_end",
        rating: 4,
        quickTags: ["good_pace"],
        freeText: "Nice pacing.",
        forcedChoice: {
          returnTomorrow: "yes",
          clarity: "very_clear",
          pace: "just_right",
          answerChecking: "fair",
        },
        testerContext: {
          version: 1,
          selfReportedLevel: "A1",
          goal: "SPEAKING",
          updatedAtISO: "2026-02-12T09:00:00.000Z",
        },
        supportLevel: "medium",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("rejects freeText that is too long", async () => {
    const req: any = {
      body: {
        userId: "u1",
        targetLanguage: "en",
        lessonId: "basic-1",
        feedbackType: "lesson_end",
        freeText: "x".repeat(501),
      },
    };

    const res = mockRes();
    await submitLessonFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "TEXT_TOO_LONG" }),
    );
  });

  it("rejects rating out of range", async () => {
    const req: any = {
      body: {
        userId: "u1",
        targetLanguage: "en",
        lessonId: "basic-1",
        feedbackType: "lesson_end",
        rating: 9,
      },
    };

    const res = mockRes();
    await submitLessonFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_RATING" }),
    );
  });

  it("rejects invalid forced choice values", async () => {
    const req: any = {
      body: {
        userId: "u1",
        targetLanguage: "en",
        lessonId: "basic-1",
        feedbackType: "lesson_end",
        forcedChoice: {
          clarity: "super_clear",
        },
        rating: 3,
      },
    };

    const res = mockRes();
    await submitLessonFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_FORCED_CHOICE" }),
    );
  });

  it("rejects invalid tester context values", async () => {
    const req: any = {
      body: {
        userId: "u1",
        targetLanguage: "en",
        lessonId: "basic-1",
        feedbackType: "lesson_end",
        rating: 3,
        testerContext: {
          version: 1,
          selfReportedLevel: "A3",
          goal: "SPEAKING",
        },
      },
    };

    const res = mockRes();
    await submitLessonFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_TESTER_CONTEXT" }),
    );
  });
});
