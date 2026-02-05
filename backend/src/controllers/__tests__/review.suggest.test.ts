// backend/src/controllers/__tests__/review.suggest.test.ts

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const findOneMock = vi.hoisted(() => vi.fn());

vi.mock("../../state/learnerProfileState", () => {
  return {
    LearnerProfileModel: {
      findOne: findOneMock,
    },
  };
});

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("reviewController.suggestReview", () => {
  beforeEach(() => {
    findOneMock.mockReset();
    findOneMock.mockReturnValue({ lean: vi.fn(async () => null) });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("400 when userId is missing", async () => {
    const { suggestReview } = await import("../reviewController");
    const req: any = { body: { language: "en" } };
    const res = makeRes();

    await suggestReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
  });

  it("returns empty when profile does not exist", async () => {
    findOneMock.mockReturnValueOnce({ lean: vi.fn(async () => null) });

    const { suggestReview } = await import("../reviewController");
    const req: any = { body: { userId: "u1", language: "en" } };
    const res = makeRes();

    await suggestReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ items: [], message: "" });
  });

  it("returns suggested items (bounded) from review items", async () => {
    const profile = {
      reviewItems: {
        "basic-1__q3": {
          lessonId: "basic-1",
          questionId: "3",
          conceptTag: "articles",
          lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
          mistakeCount: 3,
          confidence: 0.4,
        },
        "basic-2__q1": {
          lessonId: "basic-2",
          questionId: "1",
          conceptTag: "word_order",
          lastSeenAt: new Date("2026-01-31T10:00:00.000Z"),
          mistakeCount: 1,
          confidence: 0.6,
        },
      },
    };

    findOneMock.mockReturnValueOnce({ lean: vi.fn(async () => profile) });

    const { suggestReview } = await import("../reviewController");
    const req: any = { body: { userId: "u1", language: "en", maxItems: 1 } };
    const res = makeRes();

    await suggestReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const payload = (res.json.mock.calls[0] ?? [])[0];
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].conceptTag).toBe("articles");
    expect(payload.items[0].lessonId).toBe("basic-1");
    expect(payload.items[0].questionId).toBe("3");
    expect(typeof payload.items[0].reason).toBe("string");
    expect(typeof payload.message).toBe("string");
  });

  it("supports query params and caps to 2 by default", async () => {
    const profile = {
      reviewItems: {
        a: {
          lessonId: "basic-1",
          questionId: "1",
          conceptTag: "articles",
          lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
          mistakeCount: 3,
          confidence: 0.4,
        },
        b: {
          lessonId: "basic-1",
          questionId: "2",
          conceptTag: "word_order",
          lastSeenAt: new Date("2026-01-21T10:00:00.000Z"),
          mistakeCount: 2,
          confidence: 0.5,
        },
        c: {
          lessonId: "basic-1",
          questionId: "3",
          conceptTag: "typos",
          lastSeenAt: new Date("2026-01-22T10:00:00.000Z"),
          mistakeCount: 1,
          confidence: 0.6,
        },
      },
    };

    findOneMock.mockReturnValueOnce({ lean: vi.fn(async () => profile) });

    const { suggestReview } = await import("../reviewController");
    const req: any = { query: { userId: "u1", language: "en" } };
    const res = makeRes();

    await suggestReview(req, res);

    const payload = (res.json.mock.calls[0] ?? [])[0];
    expect(payload.items).toHaveLength(2);
  });
});
