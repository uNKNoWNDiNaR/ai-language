//backend/src/controllers/__tests__/practice.submit.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitPractice } from "../practiceSubmitController";
import { explainPracticeResult } from "../../ai/practiceTutorEplainer";

vi.mock("../../storage/sessionStore", () => {
  return {
    getSession: vi.fn(),
    updateSession: vi.fn(),
  };
});

vi.mock("../../state/answerEvaluator", () => {
  return {
    evaluateAnswer: vi.fn(),
  };
});

vi.mock("../../ai/practiceTutorEplainer", () => {
  return {
    explainPracticeResult: vi.fn(async () => null),
  };
});


import { getSession, updateSession } from "../../storage/sessionStore";
import { evaluateAnswer } from "../../state/answerEvaluator";

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("POST /practice/submit (controller)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("400 if missing userId", async () => {
    const req: any = { body: { practiceId: "p1", answer: "Hi" } };
    const res = makeRes();

    await submitPractice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404 if session not found", async () => {
    (getSession as any).mockResolvedValue(null);

    const req: any = { body: { userId: "u1", practiceId: "p1", answer: "Hi" } };
    const res = makeRes();

    await submitPractice(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("404 if practice item not found in session", async () => {
    (getSession as any).mockResolvedValue({ userId: "u1", practiceById: {}, practiceAttempts: {} });

    const req: any = { body: { userId: "u1", practiceId: "p404", answer: "Hi" } };
    const res = makeRes();

    await submitPractice(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200 correct answer increments attemptCount", async () => {
    (getSession as any).mockResolvedValue({
      userId: "u1",
      practiceById: {
        p1: {
          practiceId: "p1",
          lessonId: "basic-1",
          language: "en",
          prompt: "Say Hi",
          expectedAnswerRaw: "Hi",
          examples: ["Hi", "Hello"],
          meta: { type: "variation", conceptTag: "q1" },
        },
      },
      practiceAttempts: { p1: 0 },
    });

    (evaluateAnswer as any).mockReturnValue({ result: "correct" });

    const req: any = { body: { userId: "u1", practiceId: "p1", answer: "Hi" } };
    const res = makeRes();

    await submitPractice(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.result).toBe("correct");
    expect(payload.attemptCount).toBe(1);
    expect(updateSession).toHaveBeenCalled();
  });

  it("never returns internal labels in tutorMessage (falls back to baseMessage)", async () => {
  (getSession as any).mockResolvedValue({
    userId: "u1",
    practiceById: {
      p1: {
        practiceId: "p1",
        lessonId: "basic-1",
        language: "en",
        prompt: "Say Hi",
        expectedAnswerRaw: "Hi",
        examples: ["Hi", "Hello"],
        meta: { type: "variation", conceptTag: "q1" },
      },
    },
    practiceAttempts: { p1: 0 },
  });

    (evaluateAnswer as any).mockReturnValue({ result: "correct" });
    (explainPracticeResult as any).mockResolvedValueOnce(
      "Result: correct\nReason: some internal\nNice work."
    );
  
    const req: any = { body: { userId: "u1", practiceId: "p1", answer: "Hi" } };
    const res = makeRes();
  
    await submitPractice(req, res);
  
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
  
    expect(payload.tutorMessage).not.toMatch(/\bResult\b\s*[:\-–—>]/i);
    expect(payload.tutorMessage).not.toMatch(/\bReason\b\s*[:\-–—>]/i);
  
    // Debug-labeled explainer output is rejected; we return calm deterministic copy instead.
    expect(payload.tutorMessage).toBe("Nice — that’s correct.");
  });


    it("correct practice submit consumes item and resets cooldown for source question", async () => {
    const practiceById = new Map<string, any>();
    practiceById.set("p1", {
      practiceId: "p1",
      lessonId: "basic-1",
      language: "en",
      prompt: "Say Hi",
      expectedAnswerRaw: "Hi",
      examples: ["Hi", "Hello"],
      meta: { type: "variation", conceptTag: "lesson-basic-1-q1" },
    });

    const practiceAttempts = new Map<string, number>();
    practiceAttempts.set("p1", 0);

    const practiceCooldownByQuestionId = new Map<string, number>();
    practiceCooldownByQuestionId.set("1", 1); // cooldown active for q1

    const session: any = {
      userId: "u1",
      practiceById,
      practiceAttempts,
      practiceCooldownByQuestionId,
    };

    (getSession as any).mockResolvedValue(session);
    (evaluateAnswer as any).mockReturnValue({ result: "correct" });

    const req: any = { body: { userId: "u1", practiceId: "p1", answer: "Hi" } };
    const res = makeRes();

    await submitPractice(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.result).toBe("correct");
    expect(payload.attemptCount).toBe(1);

    // consumed
    expect(session.practiceById.has("p1")).toBe(false);
    expect(session.practiceAttempts.has("p1")).toBe(false);

    // cooldown reset
    expect(session.practiceCooldownByQuestionId.get("1")).toBe(0);

    expect(updateSession).toHaveBeenCalled();
  });


  it("incorrect twice escalates to hint on attempt 2", async () => {
    const session: any = {
      userId: "u1",
      practiceById: {
        p1: {
          practiceId: "p1",
          lessonId: "basic-1",
          language: "en",
          prompt: "Say Hi",
          expectedAnswerRaw: "Hi",
          hints: ["Use a short greeting like 'Hi'.", "It's 2 letters."],
          meta: { type: "variation", conceptTag: "q1" },
        },
      },
      practiceAttempts: { p1: 0 },
    };

    (getSession as any).mockResolvedValue(session);
    (evaluateAnswer as any).mockReturnValue({ result: "wrong" });

    const res1 = makeRes();
    await submitPractice({ body: { userId: "u1", practiceId: "p1", answer: "No" } } as any, res1);
    expect(res1.json.mock.calls[0][0].attemptCount).toBe(1);
    expect(res1.json.mock.calls[0][0].tutorMessage).toMatch(/Try again/i);

    const res2 = makeRes();
    await submitPractice({ body: { userId: "u1", practiceId: "p1", answer: "No" } } as any, res2);
    const payload2 = res2.json.mock.calls[0][0];
    expect(payload2.attemptCount).toBe(2);
    expect(payload2.tutorMessage).toMatch(/Use a short greeting/i);
  });

    it("on correct: consumes practice item and clears cooldown for its question", async () => {
    const practiceId = "p1";

    const session: any = {
      userId: "u1",
      practiceById: new Map([
        [
          practiceId,
          {
            practiceId,
            lessonId: "basic-1",
            language: "en",
            prompt: "Say Hi",
            expectedAnswerRaw: "Hi",
            meta: { type: "variation", conceptTag: "lesson-basic-1-q1" },
          },
        ],
      ]),
      practiceAttempts: new Map([[practiceId, 0]]),
      practiceCooldownByQuestionId: new Map([["1", 1]]),
    };

    (getSession as any).mockResolvedValue(session);
    (evaluateAnswer as any).mockReturnValue({ result: "correct" });

    const req: any = { body: { userId: "u1", practiceId, answer: "Hi" } };
    const res = makeRes();

    await submitPractice(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // practice is consumed (removed)
    expect(session.practiceById.has(practiceId)).toBe(false);
    expect(session.practiceAttempts.has(practiceId)).toBe(false);

    // cooldown cleared for q1
    expect(session.practiceCooldownByQuestionId.get("1")).toBe(0);

    expect(updateSession).toHaveBeenCalled();
  });

  
});
