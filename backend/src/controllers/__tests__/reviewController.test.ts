// backend/src/controllers/__tests__/reviewController.test.ts

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const findOneMock = vi.hoisted(() => vi.fn());
const updateOneMock = vi.hoisted(() => vi.fn());
const getReviewQueueSnapshotMock = vi.hoisted(() => vi.fn());
const enqueueReviewQueueItemsMock = vi.hoisted(() => vi.fn());

vi.mock("../../state/learnerProfileState", () => {
  return {
    LearnerProfileModel: {
      findOne: findOneMock,
      updateOne: updateOneMock,
    },
  };
});

vi.mock("../../storage/learnerProfileStore", () => {
  return {
    getReviewQueueSnapshot: getReviewQueueSnapshotMock,
    enqueueReviewQueueItems: enqueueReviewQueueItemsMock,
  };
});

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("reviewController.getReviewSuggested", () => {
  beforeEach(() => {
    getReviewQueueSnapshotMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns due items capped to 5 and includes summary", async () => {
    const now = new Date("2026-02-01T10:00:00.000Z");
    const due = new Date("2026-02-01T09:00:00.000Z");

    const items = Array.from({ length: 6 }).map((_, idx) => ({
      id: `id-${idx}`,
      lessonId: "basic-1",
      conceptTag: "articles",
      prompt: "Prompt",
      expected: "Answer",
      createdAt: now,
      dueAt: due,
      attempts: 0,
    }));

    getReviewQueueSnapshotMock.mockResolvedValue({
      reviewQueue: items,
      lastSummary: {
        lessonId: "basic-1",
        completedAt: now,
        didWell: "You completed the lesson.",
        focusNext: ["articles"],
      },
    });

    const { getReviewSuggested } = await import("../reviewController");
    const req: any = { query: { userId: "u1", language: "en" } };
    const res = makeRes();

    await getReviewSuggested(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.items).toHaveLength(5);
    expect(payload.summary.lessonId).toBe("basic-1");
  });
});

describe("reviewController.submitReview", () => {
  beforeEach(() => {
    findOneMock.mockReset();
    updateOneMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 when the review item is missing", async () => {
    findOneMock.mockReturnValueOnce({ lean: vi.fn(async () => ({ reviewQueue: [] })) });

    const { submitReview } = await import("../reviewController");
    const req: any = {
      body: { userId: "u1", language: "en", itemId: "missing", answer: "Hi" },
    };
    const res = makeRes();

    await submitReview(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("evaluates a correct answer and schedules next due date", async () => {
    const now = new Date("2026-02-01T10:00:00.000Z");
    findOneMock.mockReturnValueOnce({
      lean: vi.fn(async () => ({
        reviewQueue: [
          {
            id: "id-1",
            lessonId: "basic-1",
            conceptTag: "articles",
            prompt: "Hello",
            expected: "Hello",
            createdAt: now,
            dueAt: now,
            attempts: 0,
          },
        ],
      })),
    });
    updateOneMock.mockResolvedValueOnce({});

    const { submitReview } = await import("../reviewController");
    const req: any = {
      body: { userId: "u1", language: "en", itemId: "id-1", answer: "Hello" },
    };
    const res = makeRes();

    await submitReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.result).toBe("correct");
    expect(payload.nextItem).toBeNull();
    expect(payload.remaining).toBe(0);
  });
});
