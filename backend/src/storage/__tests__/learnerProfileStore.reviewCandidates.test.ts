import { describe, expect, it, vi, beforeEach } from "vitest";

const updateOneMock = vi.hoisted(() => vi.fn(async () => ({})));
const findOneMock = vi.hoisted(() => vi.fn());

vi.mock("mongoose", () => ({
  default: {
    connection: { readyState: 1 },
  },
}));

vi.mock("../../state/learnerProfileState", () => ({
  LearnerProfileModel: {
    updateOne: updateOneMock,
    findOne: findOneMock,
  },
}));

describe("recordLessonAttempt review candidates", () => {
  beforeEach(() => {
    updateOneMock.mockReset();
    findOneMock.mockReset();
    findOneMock.mockReturnValue({ lean: vi.fn(async () => null) });
  });

  it("forcedAdvance always creates/updates a review candidate", async () => {
    const { recordLessonAttempt } = await import("../learnerProfileStore");

    findOneMock.mockReturnValueOnce({ lean: vi.fn(async () => ({ reviewItems: {} })) });

    await recordLessonAttempt({
      userId: "u1",
      language: "en",
      result: "wrong",
      reasonCode: "OTHER",
      forcedAdvance: true,
      repeatedWrong: false,
      conceptTag: "articles",
      lessonId: "basic-1",
      questionId: "3",
    });

    const reviewKey = "basic-1__q3";
    const call = updateOneMock.mock.calls.find(([, update]) =>
      update?.$set?.[`reviewItems.${reviewKey}.lessonId`]
    );

    expect(call).toBeTruthy();
    const update = call?.[1] ?? {};
    expect(update.$set[`reviewItems.${reviewKey}.lastOutcome`]).toBe("forced_advance");
    expect(update.$inc[`reviewItems.${reviewKey}.mistakeCount`]).toBe(1);
  });

  it("caps review items so they don't grow forever", async () => {
    const { recordLessonAttempt } = await import("../learnerProfileStore");

    const reviewItems: Record<string, any> = {};
    for (let i = 0; i < 130; i += 1) {
      reviewItems[`item_${i}`] = {
        lessonId: "basic-1",
        questionId: String(i),
        conceptTag: "articles",
        lastSeenAt: new Date(2026, 0, i + 1),
        lastOutcome: "wrong",
        mistakeCount: i,
      };
    }

    findOneMock.mockReturnValueOnce({ lean: vi.fn(async () => ({ reviewItems })) });

    await recordLessonAttempt({
      userId: "u1",
      language: "en",
      result: "wrong",
      reasonCode: "OTHER",
      forcedAdvance: true,
      repeatedWrong: false,
      conceptTag: "articles",
      lessonId: "basic-1",
      questionId: "1",
    });

    const capCall = updateOneMock.mock.calls.find(([, update]) => update?.$set?.reviewItems);
    expect(capCall).toBeTruthy();

    const updatedItems = (capCall?.[1] as any)?.$set?.reviewItems ?? {};
    expect(Object.keys(updatedItems).length).toBeLessThanOrEqual(120);
  });

  it("adjusts confidence after review practice", async () => {
    const { recordReviewPracticeOutcome } = await import("../learnerProfileStore");

    const reviewKey = "basic-1__q3";
    findOneMock.mockReturnValueOnce({
      lean: vi.fn(async () => ({
        reviewItems: {
          [reviewKey]: {
            lessonId: "basic-1",
            questionId: "3",
            conceptTag: "articles",
            lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
            lastOutcome: "wrong",
            mistakeCount: 2,
            confidence: 0.5,
          },
        },
      })),
    });

    await recordReviewPracticeOutcome({
      userId: "u1",
      language: "en",
      lessonId: "basic-1",
      questionId: "3",
      result: "correct",
      conceptTag: "articles",
    });

    const call = updateOneMock.mock.calls.find(([, update]) =>
      update?.$set?.[`reviewItems.${reviewKey}.confidence`]
    );
    expect(call).toBeTruthy();
    const updatedConfidence = (call?.[1] as any)?.$set?.[`reviewItems.${reviewKey}.confidence`];
    expect(updatedConfidence).toBeCloseTo(0.65, 2);
  });

  it("removes review item when confidence reaches mastery", async () => {
    const { recordReviewPracticeOutcome } = await import("../learnerProfileStore");

    const reviewKey = "basic-1__q3";
    findOneMock.mockReturnValueOnce({
      lean: vi.fn(async () => ({
        reviewItems: {
          [reviewKey]: {
            lessonId: "basic-1",
            questionId: "3",
            conceptTag: "articles",
            lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
            lastOutcome: "wrong",
            mistakeCount: 2,
            confidence: 0.85,
          },
        },
      })),
    });

    await recordReviewPracticeOutcome({
      userId: "u1",
      language: "en",
      lessonId: "basic-1",
      questionId: "3",
      result: "correct",
      conceptTag: "articles",
    });

    const call = updateOneMock.mock.calls.find(([, update]) =>
      update?.$unset?.[`reviewItems.${reviewKey}`] !== undefined
    );
    expect(call).toBeTruthy();
  });
});
